"""Streaming chat response helper.

One request = one stream. No background runs, no Redis, no queue.
If the client disconnects, the generator is cancelled and the partial
assistant message is persisted with status='cancelled'.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from sqlalchemy import select

from aerith.config import get_settings
from aerith.db.models import Chat, ChatDatasetLink, Message
from aerith.db.session import app_session
from aerith.services.ai_service import AIService
from aerith.services.chat_title import (
    apply_chat_title,
    generate_chat_title,
    should_autotitle_chat,
)
from aerith.services.guardrails import with_guardrails
from aerith.services.llm_resolver import resolve_llm

logger = logging.getLogger(__name__)


def format_sse(event: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")


async def stream_chat_response(
    *,
    chat_id: str,
    user_content: str,
) -> AsyncIterator[dict[str, Any]]:
    """Yield SSE events for a single user message.

    On client disconnect the consumer task is cancelled; we catch it, flag the
    worker thread to stop, and persist whatever partial text was produced as a
    'cancelled' assistant message.
    """

    def _log_sse_error(detail: str) -> None:
        logger.warning("chat stream SSE error chat_id=%s detail=%s", chat_id, detail[:2000])

    with app_session() as s:
        chat = s.get(Chat, chat_id)
        if chat is None:
            _log_sse_error("Chat not found")
            yield {"type": "error", "detail": "Chat not found"}
            return
        llm = resolve_llm(s, chat)
        api_key = llm.api_key
        base_url = llm.base_url
        model = llm.model
        chat_mode = chat.chat_mode
        module_id = chat.module_id
        charts_enabled = chat.analytics_charts_enabled
        web_search_enabled = chat.web_search_enabled
        rows = s.scalars(
            select(Message).where(Message.chat_id == chat_id).order_by(Message.id.asc())
        ).all()
        prior = rows[:-1] if rows else []
        history_msgs = [
            {"role": m.role, "content": m.content}
            for m in prior
            if m.role in ("user", "assistant", "system")
        ]
        links = s.scalars(
            select(ChatDatasetLink).where(ChatDatasetLink.chat_id == chat_id)
        ).all()
        dataset_ids = [l.dataset_connection_id for l in links]

    logger.info(
        "chat stream start chat_id=%s mode=%s module=%s model=%r base_url=%r",
        chat_id,
        chat_mode,
        module_id,
        (model or "").strip() or "",
        (base_url or "").strip() or "",
    )

    cancel_flag = threading.Event()
    reply_parts: list[str] = []
    reply_citations: list[dict[str, Any]] = []
    final_status: str = "complete"
    error_detail: str | None = None
    start_perf = time.perf_counter()

    yield {"type": "start", "chat_id": chat_id}

    try:
        if chat_mode == "analytics":
            if not dataset_ids:
                err_msg = "Link at least one dataset to this chat (analytics mode)."
                _log_sse_error(err_msg)
                yield {"type": "error", "detail": err_msg}
                final_status = "error"
                error_detail = err_msg
            else:
                async for ev in _run_analytics(
                    user_content=user_content,
                    history=history_msgs,
                    dataset_ids=dataset_ids,
                    charts_enabled=charts_enabled,
                    web_search_enabled=web_search_enabled,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    cancel_flag=cancel_flag,
                ):
                    yield ev
                    if ev.get("type") == "delta":
                        reply_parts.append(str(ev.get("delta") or ""))
                    elif ev.get("type") == "citations":
                        reply_citations = ev.get("citations") or []
                    elif ev.get("type") == "error":
                        final_status = "error"
                        error_detail = str(ev.get("detail") or "")
                        _log_sse_error(error_detail)
        else:
            if not api_key:
                err_msg = "OpenAI API key is not configured"
                _log_sse_error(err_msg)
                yield {"type": "error", "detail": err_msg}
                final_status = "error"
                error_detail = err_msg
            else:
                async for ev in _run_chat(
                    chat_id=chat_id,
                    user_content=user_content,
                    history=history_msgs,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    web_search_enabled=web_search_enabled,
                    cancel_flag=cancel_flag,
                ):
                    yield ev
                    if ev.get("type") == "delta":
                        reply_parts.append(str(ev.get("delta") or ""))
                    elif ev.get("type") == "citations":
                        reply_citations = ev.get("citations") or []
                    elif ev.get("type") == "error":
                        final_status = "error"
                        error_detail = str(ev.get("detail") or "")
                        _log_sse_error(error_detail)
    except asyncio.CancelledError:
        cancel_flag.set()
        final_status = "cancelled"
        _persist_final(
            chat_id=chat_id,
            text="".join(reply_parts),
            status=final_status,
            elapsed_ms=int((time.perf_counter() - start_perf) * 1000),
            annotations=reply_citations or None,
        )
        raise
    except Exception as exc:  # pragma: no cover
        logger.exception("chat stream failed chat_id=%s", chat_id)
        final_status = "error"
        error_detail = str(exc)
        yield {"type": "error", "detail": error_detail}

    elapsed_ms = int((time.perf_counter() - start_perf) * 1000)
    persist_text = "".join(reply_parts)
    if final_status == "error":
        if not persist_text.strip():
            persist_text = (error_detail or "").strip() or "An error occurred while generating the response."
        else:
            ed = (error_detail or "").strip()
            if ed and ed not in persist_text:
                persist_text = f"{persist_text}\n\n— Error: {ed}"
        logger.warning(
            "assistant reply failed chat_id=%s detail=%s",
            chat_id,
            (error_detail or persist_text)[:2000],
        )
    message_id = _persist_final(
        chat_id=chat_id,
        text=persist_text,
        status=final_status,
        elapsed_ms=elapsed_ms,
        annotations=reply_citations or None,
    )

    generated_title: str | None = None
    if final_status == "complete" and should_autotitle_chat(chat_id):
        loop = asyncio.get_running_loop()
        try:
            title = await loop.run_in_executor(
                None,
                lambda: generate_chat_title(
                    user_content,
                    persist_text[:500] if persist_text else None,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                ),
            )
            generated_title = apply_chat_title(chat_id, title)
        except Exception:
            logger.exception("auto chat title failed chat_id=%s", chat_id)

    yield {
        "type": "done",
        "status": final_status,
        "elapsed_ms": elapsed_ms,
        "message_id": message_id,
        "error": error_detail,
        "citations": reply_citations or None,
        "title": generated_title,
    }


def _persist_final(
    *,
    chat_id: str,
    text: str,
    status: str,
    elapsed_ms: int,
    annotations: list[dict[str, Any]] | None = None,
) -> int | None:
    try:
        with app_session() as s:
            msg = Message(
                chat_id=chat_id,
                role="assistant",
                content=text,
                status=status,
                elapsed_ms=elapsed_ms,
                annotations=annotations if annotations else None,
            )
            s.add(msg)
            chat = s.get(Chat, chat_id)
            if chat is not None:
                chat.updated_at = datetime.now(timezone.utc)
            s.commit()
            s.refresh(msg)
            return msg.id
    except Exception:  # pragma: no cover
        logger.exception("failed to persist assistant message")
        return None


async def _run_chat(
    *,
    chat_id: str,
    user_content: str,
    history: list[dict[str, Any]],
    api_key: str,
    base_url: str,
    model: str,
    web_search_enabled: bool,
    cancel_flag: threading.Event,
) -> AsyncIterator[dict[str, Any]]:
    settings = get_settings()
    system_prompt = with_guardrails(settings.chat.default_system_prompt)
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    # History may contain stored system messages; drop them so nothing can
    # displace the server-side guardrail prompt.
    messages.extend(m for m in history if m.get("role") != "system")
    messages.append({"role": "user", "content": user_content})

    ai = AIService(api_key=api_key, base_url=base_url, model=model)
    loop = asyncio.get_running_loop()
    iterator = await loop.run_in_executor(
        None,
        lambda: iter(
            ai.reply_stream(
                messages,
                temperature=settings.chat.default_temperature,
                web_search_enabled=web_search_enabled,
                web_search_context_size=settings.chat.web_search_context_size,
                web_search_deep_read=settings.chat.web_search_deep_read,
                cancel_flag=cancel_flag,
            )
        ),
    )
    while True:
        if cancel_flag.is_set():
            return
        try:
            event = await loop.run_in_executor(None, _next_or_none, iterator)
        except Exception as exc:
            logger.warning("LLM stream chunk failed chat_id=%s: %s", chat_id, exc)
            yield {"type": "error", "detail": f"Model failed: {exc}"}
            return
        if event is None:
            return
        if event.get("type") == "content":
            yield {"type": "delta", "delta": event.get("content") or ""}
        elif event.get("type") == "annotations":
            yield {
                "type": "citations",
                "citations": event.get("annotations") or [],
            }


async def _run_analytics(
    *,
    user_content: str,
    history: list[dict[str, Any]],
    dataset_ids: list[str],
    charts_enabled: bool,
    web_search_enabled: bool,
    api_key: str,
    base_url: str,
    model: str,
    cancel_flag: threading.Event,
) -> AsyncIterator[dict[str, Any]]:
    from aerith.services.analytics_swarm import stream_analytics_swarm

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def produce() -> None:
        try:
            settings = get_settings()
            for ev in stream_analytics_swarm(
                dataset_ids=dataset_ids,
                messages=history,
                user_message=user_content,
                model_id=model,
                api_key=api_key,
                base_url=base_url,
                temperature=settings.chat.default_temperature,
                charts_enabled=charts_enabled,
                web_search_enabled=web_search_enabled,
                web_search_context_size=settings.chat.web_search_context_size,
                web_search_deep_read=settings.chat.web_search_deep_read,
                cancel_flag=cancel_flag,
            ):
                asyncio.run_coroutine_threadsafe(queue.put(ev), loop)
                if cancel_flag.is_set():
                    break
        except Exception as exc:  # pragma: no cover
            asyncio.run_coroutine_threadsafe(queue.put({"type": "error", "detail": str(exc)}), loop)
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    fut = loop.run_in_executor(None, produce)
    try:
        while True:
            ev = await queue.get()
            if ev is None:
                break
            yield ev
    finally:
        cancel_flag.set()
        try:
            await fut
        except Exception:  # pragma: no cover
            logger.exception("analytics worker crashed")


def _next_or_none(iterator):
    try:
        return next(iterator)
    except StopIteration:
        return None
