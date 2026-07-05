"""Resolve which LLM credentials and model a chat should use.

Priority: chat's provider -> user's default provider -> server-wide LLM__* env.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select

from aerith.auth.security import decrypt_secret
from aerith.config import get_settings
from aerith.db.models import Chat, LlmProvider


@dataclass(frozen=True)
class ResolvedLLM:
    api_key: str
    base_url: str
    model: str


def resolve_llm(session, chat: Chat) -> ResolvedLLM:
    """Resolve credentials for a chat inside an open DB session."""
    provider: LlmProvider | None = None
    if chat.llm_provider_id:
        provider = session.get(LlmProvider, chat.llm_provider_id)
        if provider is not None and provider.user_id != chat.user_id:
            provider = None
    if provider is None:
        provider = session.scalars(
            select(LlmProvider)
            .where(LlmProvider.user_id == chat.user_id, LlmProvider.is_default.is_(True))
            .limit(1)
        ).first()

    if provider is not None:
        models = [str(m) for m in (provider.models or []) if str(m).strip()]
        model = (chat.llm_model or "").strip()
        if not model or (models and model not in models):
            model = models[0] if models else get_settings().llm.default_model
        return ResolvedLLM(
            api_key=decrypt_secret(provider.api_key_encrypted),
            base_url=provider.base_url,
            model=model,
        )

    llm = get_settings().llm
    return ResolvedLLM(api_key=llm.api_key, base_url=llm.base_url, model=llm.default_model)
