"""User-managed OpenAI-compatible LLM providers (BYOK)."""

from __future__ import annotations

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update

from aerith.auth.dependencies import CurrentFreshUser, DBSession
from aerith.auth.security import decrypt_secret, encrypt_secret
from aerith.config import get_settings
from aerith.db.models import LlmProvider

router = APIRouter(prefix="/api/llm", tags=["llm"])

MAX_PROVIDERS_PER_USER = 20


def _mask_key(key: str) -> str:
    if not key:
        return ""
    return f"...{key[-4:]}" if len(key) > 4 else "****"


def _provider_dict(p: LlmProvider) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "base_url": p.base_url,
        "api_key_masked": _mask_key(decrypt_secret(p.api_key_encrypted)),
        "models": list(p.models or []),
        "is_default": p.is_default,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


class ProviderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    base_url: str = Field(min_length=1)
    api_key: str = ""
    is_default: bool = False


class ProviderPatchRequest(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None  # None = keep current key
    is_default: bool | None = None


def _fetch_remote_models(base_url: str, api_key: str) -> list[str]:
    """Query the provider's OpenAI-compatible /models endpoint.

    Returns a sorted, deduplicated list of model ids; raises HTTPException
    on network/protocol failure so the caller can surface the error.
    """
    url = f"{base_url.rstrip('/')}/models"
    try:
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Provider request failed: {exc}")
    items = data.get("data") if isinstance(data, dict) else None
    models = sorted(
        {
            str(item.get("id"))
            for item in (items or [])
            if isinstance(item, dict) and item.get("id")
        }
    )
    return models[:500]


def _get_owned(provider_id: str, user_id: str, db) -> LlmProvider:
    p = db.get(LlmProvider, provider_id)
    if p is None or p.user_id != user_id:
        raise HTTPException(status_code=404, detail="Provider not found")
    return p


def _clear_other_defaults(db, user_id: str, keep_id: str) -> None:
    db.execute(
        update(LlmProvider)
        .where(LlmProvider.user_id == user_id, LlmProvider.id != keep_id)
        .values(is_default=False)
    )


@router.get("/providers")
def list_providers(user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    rows = db.scalars(
        select(LlmProvider)
        .where(LlmProvider.user_id == user.id)
        .order_by(LlmProvider.created_at.asc())
    ).all()
    server_llm = get_settings().llm
    return {
        "providers": [_provider_dict(p) for p in rows],
        # Advertise the server-wide fallback so the UI can show it as an option.
        "server_fallback": {
            "configured": bool(server_llm.api_key),
            "default_model": server_llm.default_model,
        },
    }


@router.post("/providers")
def create_provider(
    payload: ProviderCreateRequest, user: CurrentFreshUser, db: DBSession
) -> dict[str, Any]:
    count = len(
        db.scalars(select(LlmProvider.id).where(LlmProvider.user_id == user.id)).all()
    )
    if count >= MAX_PROVIDERS_PER_USER:
        raise HTTPException(status_code=400, detail="Provider limit reached")
    base_url = payload.base_url.strip().rstrip("/")
    api_key = payload.api_key.strip()
    # Validates connectivity/credentials and fills the model list in one call.
    models = _fetch_remote_models(base_url, api_key)
    p = LlmProvider(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=payload.name.strip(),
        base_url=base_url,
        api_key_encrypted=encrypt_secret(api_key),
        models=models,
        is_default=payload.is_default or count == 0,
    )
    db.add(p)
    if p.is_default:
        _clear_other_defaults(db, user.id, p.id)
    db.commit()
    db.refresh(p)
    return _provider_dict(p)


@router.patch("/providers/{provider_id}")
def patch_provider(
    provider_id: str,
    payload: ProviderPatchRequest,
    user: CurrentFreshUser,
    db: DBSession,
) -> dict[str, Any]:
    p = _get_owned(provider_id, user.id, db)
    if payload.name is not None:
        p.name = payload.name.strip() or p.name
    if payload.base_url is not None:
        p.base_url = payload.base_url.strip().rstrip("/") or p.base_url
    if payload.api_key is not None:
        p.api_key_encrypted = encrypt_secret(payload.api_key.strip())
    if payload.base_url is not None or payload.api_key is not None:
        # Connection details changed — refresh the model list from the provider.
        p.models = _fetch_remote_models(p.base_url, decrypt_secret(p.api_key_encrypted))
    if payload.is_default is not None:
        p.is_default = bool(payload.is_default)
        if p.is_default:
            _clear_other_defaults(db, user.id, p.id)
    db.commit()
    db.refresh(p)
    return _provider_dict(p)


@router.delete("/providers/{provider_id}")
def delete_provider(provider_id: str, user: CurrentFreshUser, db: DBSession) -> dict[str, bool]:
    p = _get_owned(provider_id, user.id, db)
    db.delete(p)
    db.commit()
    return {"deleted": True}


@router.post("/providers/{provider_id}/refresh-models")
def refresh_models(provider_id: str, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    """Re-query the provider's /models endpoint and store the fresh list."""
    p = _get_owned(provider_id, user.id, db)
    p.models = _fetch_remote_models(p.base_url, decrypt_secret(p.api_key_encrypted))
    db.commit()
    db.refresh(p)
    return _provider_dict(p)
