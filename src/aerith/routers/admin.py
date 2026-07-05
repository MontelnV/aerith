"""Admin routes: users + invites."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from aerith.auth.dependencies import CurrentAdmin, DBSession
from aerith.auth.security import generate_invite_token
from aerith.config import get_settings
from aerith.db.models import Invite, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _user_dict(u: User) -> dict[str, Any]:
    return {
        "id": u.id,
        "login": u.login,
        "display_name": u.display_name,
        "role": u.role,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
    }


def _invite_dict(inv: Invite, *, raw_token: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    exp = inv.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    status_str = "active"
    if inv.used_at is not None:
        status_str = "used"
    elif inv.revoked_at is not None:
        status_str = "revoked"
    elif exp < now:
        status_str = "expired"
    d: dict[str, Any] = {
        "id": inv.id,
        "note": inv.note,
        "status": status_str,
        "expires_at": exp.isoformat(),
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "used_at": inv.used_at.isoformat() if inv.used_at else None,
        "used_by_user_id": inv.used_by_user_id,
        "revoked_at": inv.revoked_at.isoformat() if inv.revoked_at else None,
    }
    if raw_token:
        public_url = get_settings().server.public_url.rstrip("/") or ""
        d["token"] = raw_token
        d["invite_link"] = f"{public_url}/invite?token={raw_token}" if public_url else f"/invite?token={raw_token}"
    return d


@router.get("/users")
def list_users(admin: CurrentAdmin, db: DBSession) -> list[dict[str, Any]]:
    rows = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [_user_dict(u) for u in rows]


class UserPatchRequest(BaseModel):
    is_active: bool | None = None
    role: str | None = None
    display_name: str | None = None


@router.patch("/users/{user_id}")
def patch_user(user_id: str, payload: UserPatchRequest, admin: CurrentAdmin, db: DBSession) -> dict[str, Any]:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.is_active is not None:
        if user.id == admin.id and not payload.is_active:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        user.is_active = bool(payload.is_active)
    if payload.role is not None:
        if payload.role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Invalid role")
        if user.id == admin.id and payload.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot demote yourself")
        user.role = payload.role
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    db.commit()
    return _user_dict(user)


class InviteCreateRequest(BaseModel):
    note: str = ""
    ttl_hours: int | None = Field(default=None, ge=1, le=24 * 30)


@router.get("/invites")
def list_invites(admin: CurrentAdmin, db: DBSession) -> list[dict[str, Any]]:
    rows = db.scalars(select(Invite).order_by(Invite.created_at.desc())).all()
    return [_invite_dict(i) for i in rows]


@router.post("/invites")
def create_invite(payload: InviteCreateRequest, admin: CurrentAdmin, db: DBSession) -> dict[str, Any]:
    auth = get_settings().auth
    ttl_h = payload.ttl_hours or auth.invite_ttl_hours
    raw, token_hash = generate_invite_token()
    inv = Invite(
        id=str(uuid.uuid4()),
        token_hash=token_hash,
        created_by_user_id=admin.id,
        note=payload.note.strip(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_h),
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _invite_dict(inv, raw_token=raw)


@router.delete("/invites/{invite_id}")
def revoke_invite(invite_id: str, admin: CurrentAdmin, db: DBSession) -> dict[str, Any]:
    inv = db.get(Invite, invite_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.used_at is not None:
        raise HTTPException(status_code=400, detail="Invite already used")
    if inv.revoked_at is None:
        inv.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return _invite_dict(inv)
