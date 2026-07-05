
"""Chat CRUD, messages with streaming response, dataset linking."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from aerith.auth.dependencies import CurrentFreshUser, DBSession
from aerith.config import get_settings
from aerith.db.models import (
    Chat,
    ChatDatasetLink,
    DatasetConnection,
    LlmProvider,
    Message,
)
from aerith.services.chat_runtime import format_sse, stream_chat_response
from aerith.services.chat_title import derive_title_fallback, is_placeholder_title

router = APIRouter(prefix="/api/chats", tags=["chats"])

CHAT_MODULE_IDS = frozenset({"analytics"})


def _normalize_module_id(module_id: str | None) -> str:
    mid = (module_id or "analytics").strip()
    return mid if mid in CHAT_MODULE_IDS else "analytics"


def _chat_dict(chat: Chat, *, include_messages: bool = False, db=None) -> dict[str, Any]:
    d = {
        "id": chat.id,
        "title": chat.title,
        "module_id": chat.module_id,
        "chat_mode": chat.chat_mode,
        "analytics_charts_enabled": chat.analytics_charts_enabled,
        "web_search_enabled": chat.web_search_enabled,
        "llm_provider_id": chat.llm_provider_id,
        "llm_model": chat.llm_model,
        "created_at": chat.created_at.isoformat() if chat.created_at else None,
        "updated_at": chat.updated_at.isoformat() if chat.updated_at else None,
    }
    if include_messages and db is not None:
        rows = db.scalars(
            select(Message).where(Message.chat_id == chat.id).order_by(Message.id.asc())
        ).all()
        d["messages"] = [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "status": m.status,
                "elapsed_ms": m.elapsed_ms,
                "annotations": m.annotations,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in rows
        ]
        links = db.scalars(
            select(ChatDatasetLink).where(ChatDatasetLink.chat_id == chat.id)
        ).all()
        d["dataset_ids"] = [l.dataset_connection_id for l in links]
    return d


class ChatCreateRequest(BaseModel):
    title: str | None = None
    module_id: str | None = None
    chat_mode: str | None = None
    analytics_charts_enabled: bool | None = None
    web_search_enabled: bool | None = None


class ChatPatchRequest(BaseModel):
    title: str | None = None
    chat_mode: str | None = None
    analytics_charts_enabled: bool | None = None
    web_search_enabled: bool | None = None
    llm_provider_id: str | None = None  # "" clears (use default provider)
    llm_model: str | None = None  # "" clears (use provider's first model)


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1)


class DatasetLinkRequest(BaseModel):
    dataset_connection_id: str = Field(min_length=1)


@router.get("")
def list_chats(
    user: CurrentFreshUser,
    db: DBSession,
    module_id: str | None = Query(None, description="Filter by workspace module (analytics)"),
) -> list[dict[str, Any]]:
    q = select(Chat).where(Chat.user_id == user.id)
    if module_id is not None:
        q = q.where(Chat.module_id == _normalize_module_id(module_id))
    rows = db.scalars(q.order_by(Chat.updated_at.desc())).all()
    return [_chat_dict(c, db=db) for c in rows]


@router.post("")
def create_chat(payload: ChatCreateRequest, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    module_id = _normalize_module_id(payload.module_id)
    mode = (payload.chat_mode or "chat").strip()
    if mode not in ("chat", "analytics"):
        mode = "chat"
    chat = Chat(
        id=str(uuid.uuid4()),
        user_id=user.id,
        title=(payload.title or "New chat").strip() or "New chat",
        module_id=module_id,
        chat_mode=mode,
        analytics_charts_enabled=True if payload.analytics_charts_enabled is None else bool(payload.analytics_charts_enabled),
        web_search_enabled=bool(payload.web_search_enabled) if payload.web_search_enabled is not None else False,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return _chat_dict(chat, include_messages=True, db=db)


def _get_chat_owned(chat_id: str, user_id: str, db) -> Chat:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != user_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.get("/{chat_id}")
def get_chat(chat_id: str, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    chat = _get_chat_owned(chat_id, user.id, db)
    return _chat_dict(chat, include_messages=True, db=db)


@router.patch("/{chat_id}")
def patch_chat(chat_id: str, payload: ChatPatchRequest, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    chat = _get_chat_owned(chat_id, user.id, db)
    charts_explicit = payload.analytics_charts_enabled is not None
    if payload.title is not None:
        chat.title = payload.title.strip() or chat.title
    if payload.chat_mode is not None:
        m = payload.chat_mode.strip()
        if m in ("chat", "analytics"):
            old_mode = chat.chat_mode
            chat.chat_mode = m
            if m == "analytics" and old_mode != "analytics" and not charts_explicit:
                chat.analytics_charts_enabled = True
    if payload.analytics_charts_enabled is not None:
        chat.analytics_charts_enabled = bool(payload.analytics_charts_enabled)
    if payload.web_search_enabled is not None:
        chat.web_search_enabled = bool(payload.web_search_enabled)
    if payload.llm_provider_id is not None:
        pid = payload.llm_provider_id.strip()
        if pid:
            provider = db.get(LlmProvider, pid)
            if provider is None or provider.user_id != user.id:
                raise HTTPException(status_code=404, detail="Provider not found")
            chat.llm_provider_id = pid
        else:
            chat.llm_provider_id = None
    if payload.llm_model is not None:
        chat.llm_model = payload.llm_model.strip() or None
    db.commit()
    db.refresh(chat)
    return _chat_dict(chat, include_messages=True, db=db)


@router.delete("/{chat_id}")
def delete_chat(chat_id: str, user: CurrentFreshUser, db: DBSession) -> dict[str, bool]:
    chat = _get_chat_owned(chat_id, user.id, db)
    db.delete(chat)
    db.commit()
    return {"deleted": True}


@router.post("/{chat_id}/messages")
async def post_message(
    chat_id: str,
    payload: MessageCreateRequest,
    user: CurrentFreshUser,
    db: DBSession,
) -> StreamingResponse:
    """Persist the user message and stream the assistant reply as SSE.

    The client reads the response body as an event stream. Aborting the
    request (disconnect / `AbortController`) cancels the generation and the
    partial answer is persisted with status='cancelled'.
    """
    chat = _get_chat_owned(chat_id, user.id, db)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    db.add(Message(chat_id=chat_id, role="user", content=content, status="complete"))
    if is_placeholder_title(chat.title):
        chat.title = derive_title_fallback(content)
    chat.updated_at = datetime.now(timezone.utc)
    db.commit()

    async def gen():
        async for ev in stream_chat_response(chat_id=chat_id, user_content=content):
            yield format_sse(ev)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/{chat_id}/datasets")
def list_chat_datasets(chat_id: str, user: CurrentFreshUser, db: DBSession) -> list[dict[str, Any]]:
    _get_chat_owned(chat_id, user.id, db)
    links = db.scalars(
        select(ChatDatasetLink).where(ChatDatasetLink.chat_id == chat_id).order_by(ChatDatasetLink.position.asc())
    ).all()
    out: list[dict[str, Any]] = []
    for l in links:
        d = db.get(DatasetConnection, l.dataset_connection_id)
        if d is None:
            continue
        out.append({
            "id": d.id,
            "name": d.name,
            "kind": d.kind,
            "visibility": d.visibility,
            "owner_user_id": d.owner_user_id,
            "position": l.position,
        })
    return out


@router.post("/{chat_id}/datasets")
def link_dataset(chat_id: str, payload: DatasetLinkRequest, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    chat = _get_chat_owned(chat_id, user.id, db)
    if chat.chat_mode != "analytics":
        raise HTTPException(
            status_code=400,
            detail="Datasets can only be linked in analytics mode",
        )
    ds = db.get(DatasetConnection, payload.dataset_connection_id)
    if ds is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if ds.owner_user_id != user.id and ds.visibility != "public":
        raise HTTPException(status_code=403, detail="Dataset is private")

    existing = db.scalars(
        select(ChatDatasetLink).where(ChatDatasetLink.chat_id == chat_id)
    ).all()
    if any(l.dataset_connection_id == ds.id for l in existing):
        return {"ok": True, "already": True}
    max_per_chat = get_settings().datasets.max_per_chat
    if len(existing) >= max_per_chat:
        raise HTTPException(status_code=400, detail=f"Max {max_per_chat} datasets per chat")
    max_pos = max((l.position for l in existing), default=-1)
    link = ChatDatasetLink(
        chat_id=chat_id,
        dataset_connection_id=ds.id,
        position=max_pos + 1,
    )
    db.add(link)
    db.commit()
    return {"ok": True}


@router.delete("/{chat_id}/datasets/{dataset_id}")
def unlink_dataset(chat_id: str, dataset_id: str, user: CurrentFreshUser, db: DBSession) -> dict[str, bool]:
    _get_chat_owned(chat_id, user.id, db)
    link = db.get(ChatDatasetLink, (chat_id, dataset_id))
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    db.commit()
    return {"deleted": True}
