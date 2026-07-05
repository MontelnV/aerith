"""Auto-generate short chat titles from the first exchange."""

from __future__ import annotations

import logging
import re

from sqlalchemy import func, select

from aerith.config import get_settings
from aerith.db.models import Chat, Message
from aerith.db.session import app_session

logger = logging.getLogger(__name__)

PLACEHOLDER_TITLES = frozenset({
    "",
    "New chat",
    "Untitled",
})


def is_placeholder_title(title: str | None) -> bool:
    return (title or "").strip() in PLACEHOLDER_TITLES


def derive_title_fallback(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if not t:
        return "New chat"
    return (t[:56] + "…") if len(t) > 56 else t


def generate_chat_title(
    user_message: str,
    assistant_preview: str | None = None,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> str:
    """LLM title; falls back to truncated user text on failure.

    Credentials default to the server-wide LLM config; callers that resolved
    a per-chat provider should pass its credentials explicitly.
    """
    settings = get_settings()
    if not settings.chat.auto_title_enabled:
        return derive_title_fallback(user_message)

    api_key = (api_key if api_key is not None else settings.llm.api_key).strip()
    if not api_key:
        return derive_title_fallback(user_message)

    base_url = base_url if base_url is not None else settings.llm.base_url
    model = (
        settings.chat.title_model
        or (model if model is not None else settings.llm.default_model)
        or ""
    ).strip()
    if not model:
        return derive_title_fallback(user_message)

    user_part = (user_message or "").strip()[:600]
    assistant_part = (assistant_preview or "").strip()[:400]

    user_prompt = f"User's first message:\n{user_part}"
    if assistant_part:
        user_prompt += f"\n\nStart of assistant reply:\n{assistant_part}"

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, base_url=base_url or None)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Come up with a short chat title (3–7 words) in English "
                        "that captures the conversation. Reply with only the title: no quotes, "
                        "no trailing period, no explanation."
                    ),
                },
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=32,
            temperature=0.2,
        )
        raw = (resp.choices[0].message.content or "").strip()
        raw = raw.strip("\"'«»„“").strip()
        raw = re.sub(r"\s+", " ", raw)
        if raw:
            return raw[:80]
    except Exception:
        logger.exception("chat title generation failed")

    return derive_title_fallback(user_message)


def should_autotitle_chat(chat_id: str) -> bool:
    with app_session() as s:
        chat = s.get(Chat, chat_id)
        if chat is None or not is_placeholder_title(chat.title):
            return False
        n = s.scalar(select(func.count()).select_from(Message).where(Message.chat_id == chat_id))
        return int(n or 0) <= 2


def apply_chat_title(chat_id: str, title: str) -> str | None:
    title = (title or "").strip()
    if not title:
        return None
    with app_session() as s:
        chat = s.get(Chat, chat_id)
        if chat is None or not is_placeholder_title(chat.title):
            return None
        chat.title = title[:120]
        s.commit()
        return chat.title
