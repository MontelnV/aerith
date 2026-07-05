"""Auth routes: login, logout, refresh, me, password change, accept invite."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from aerith.auth.dependencies import CurrentUser, DBSession
from aerith.auth.security import (
    decode_token,
    hash_invite_token,
    hash_password,
    issue_access_token,
    issue_refresh_token,
    verify_password,
)
from aerith.config import get_settings
from aerith.db.models import Invite, RefreshToken, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    login: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


class AcceptInviteRequest(BaseModel):
    token: str = Field(min_length=10)
    login: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6)
    display_name: str = ""


def _public_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "login": user.login,
        "display_name": user.display_name,
        "role": user.role,
        "must_change_password": user.must_change_password,
        "is_active": user.is_active,
        "theme": user.theme,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    auth = get_settings().auth
    response.set_cookie(
        key=auth.cookie_name,
        value=access,
        max_age=auth.access_ttl_minutes * 60,
        httponly=True,
        secure=auth.cookie_secure,
        samesite=auth.cookie_samesite,
        path="/",
    )
    response.set_cookie(
        key=auth.refresh_cookie_name,
        value=refresh,
        max_age=auth.refresh_ttl_days * 86400,
        httponly=True,
        secure=auth.cookie_secure,
        samesite=auth.cookie_samesite,
        path="/api/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    auth = get_settings().auth
    response.delete_cookie(auth.cookie_name, path="/")
    response.delete_cookie(auth.refresh_cookie_name, path="/api/auth")


def _issue_session(db, user: User, response: Response) -> dict[str, Any]:
    access, _ = issue_access_token(user.id, role=user.role)
    refresh, jti, exp = issue_refresh_token(user.id)
    db.add(RefreshToken(id=str(uuid.uuid4()), user_id=user.id, jti=jti, expires_at=exp))
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    _set_auth_cookies(response, access, refresh)
    return {"user": _public_user(user), "must_change_password": user.must_change_password}


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: DBSession) -> dict[str, Any]:
    login_clean = payload.login.strip().lower()
    user = db.scalar(select(User).where(User.login == login_clean))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid login or password",
        )
    return _issue_session(db, user, response)


@router.post("/logout")
def logout(request: Request, response: Response, db: DBSession) -> dict[str, bool]:
    auth = get_settings().auth
    raw = request.cookies.get(auth.refresh_cookie_name)
    if raw:
        payload = decode_token(raw)
        if payload and payload.get("type") == "refresh":
            jti = str(payload.get("jti") or "")
            if jti:
                rt = db.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
                if rt is not None and rt.revoked_at is None:
                    rt.revoked_at = datetime.now(timezone.utc)
                    db.commit()
    _clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh")
def refresh(request: Request, response: Response, db: DBSession) -> dict[str, Any]:
    auth = get_settings().auth
    raw = request.cookies.get(auth.refresh_cookie_name)
    if not raw:
        raise HTTPException(status_code=401, detail="No refresh token")
    payload = decode_token(raw)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    jti = str(payload.get("jti") or "")
    user_id = str(payload.get("sub") or "")
    rt = db.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    if rt is None or rt.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Refresh token revoked")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    rt.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return _issue_session(db, user, response)


@router.get("/me")
def me(user: CurrentUser) -> dict[str, Any]:
    return _public_user(user)


@router.post("/password")
def change_password(
    payload: ChangePasswordRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    return _public_user(user)


@router.post("/accept-invite")
def accept_invite(payload: AcceptInviteRequest, response: Response, db: DBSession) -> dict[str, Any]:
    token_hash = hash_invite_token(payload.token.strip())
    invite = db.scalar(select(Invite).where(Invite.token_hash == token_hash))
    now = datetime.now(timezone.utc)
    if invite is None or invite.revoked_at is not None or invite.used_at is not None:
        raise HTTPException(status_code=400, detail="Invalid invite")
    exp = invite.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now:
        raise HTTPException(status_code=400, detail="Invite expired")

    login_clean = payload.login.strip().lower()
    existing = db.scalar(select(User).where(User.login == login_clean))
    if existing is not None:
        raise HTTPException(status_code=400, detail="Login already taken")

    user = User(
        id=str(uuid.uuid4()),
        login=login_clean,
        password_hash=hash_password(payload.password),
        display_name=(payload.display_name or login_clean).strip() or login_clean,
        role="user",
        must_change_password=False,
        is_active=True,
    )
    db.add(user)
    db.flush()
    invite.used_at = now
    invite.used_by_user_id = user.id
    db.commit()
    db.refresh(user)
    return _issue_session(db, user, response)
