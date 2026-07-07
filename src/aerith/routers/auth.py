"""Auth routes: login/session, registration, email verification, invite flow."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from aerith.auth.dependencies import CurrentUser, DBSession
from aerith.auth.security import (
    decode_token,
    generate_email_code,
    hash_email_code,
    hash_invite_token,
    hash_password,
    issue_access_token,
    issue_refresh_token,
    verify_email_code,
    verify_password,
)
from aerith.config import get_settings
from aerith.db.models import EmailVerificationCode, Invite, RefreshToken, User
from aerith.services.email import (
    ensure_mail_delivery_configured,
    send_verification_code_email,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    login: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    login: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6)
    display_name: str = ""


class VerifyEmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    code: str = Field(min_length=4, max_length=32)


class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)


class AcceptInviteRequest(BaseModel):
    token: str = Field(min_length=10)
    login: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6)
    display_name: str = ""


def _public_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "email_verified_at": (
            user.email_verified_at.isoformat() if user.email_verified_at else None
        ),
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


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _normalize_login(value: str) -> str:
    login_clean = value.strip().lower()
    if len(login_clean) < 2:
        raise HTTPException(status_code=400, detail="Login is too short")
    return login_clean


def _normalize_email(value: str) -> str:
    email_clean = value.strip().lower()
    if "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Invalid email address")
    local, _, domain = email_clean.partition("@")
    if not local or "." not in domain:
        raise HTTPException(status_code=400, detail="Invalid email address")
    return email_clean


def _normalize_code(value: str, expected_length: int) -> str:
    digits_only = "".join(ch for ch in value if ch.isdigit())
    if len(digits_only) == expected_length:
        return digits_only
    code_clean = value.strip()
    if len(code_clean) == expected_length:
        return code_clean
    raise HTTPException(status_code=400, detail="Invalid verification code")


def _latest_pending_code(
    db: DBSession,
    *,
    user_id: str,
    email: str,
) -> EmailVerificationCode | None:
    return db.scalar(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.user_id == user_id,
            EmailVerificationCode.email == email,
            EmailVerificationCode.consumed_at.is_(None),
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .limit(1)
    )


def _issue_email_code(db: DBSession, *, user: User, email: str, now: datetime) -> str:
    for stale in db.scalars(
        select(EmailVerificationCode).where(
            EmailVerificationCode.user_id == user.id,
            EmailVerificationCode.consumed_at.is_(None),
        )
    ):
        stale.consumed_at = now

    raw_code = generate_email_code(get_settings().auth.email_code_length)
    db.add(
        EmailVerificationCode(
            id=str(uuid.uuid4()),
            user_id=user.id,
            email=email,
            code_hash=hash_email_code(raw_code),
            expires_at=now + timedelta(minutes=get_settings().auth.email_code_ttl_minutes),
            consumed_at=None,
            attempt_count=0,
            last_sent_at=now,
            created_at=now,
        )
    )
    return raw_code


def _send_verification_code_or_fail(email: str, code: str) -> None:
    auth = get_settings().auth
    try:
        ensure_mail_delivery_configured()
        send_verification_code_email(
            to_email=email,
            code=code,
            ttl_minutes=auth.email_code_ttl_minutes,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("failed to send verification email to %s", email)
        raise HTTPException(
            status_code=502,
            detail="Failed to send verification email",
        ) from exc


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: DBSession) -> dict[str, Any]:
    login_clean = _normalize_login(payload.login)
    user = db.scalar(select(User).where(User.login == login_clean))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid login or password",
        )
    return _issue_session(db, user, response)


@router.post("/register")
def register(payload: RegisterRequest, db: DBSession) -> dict[str, Any]:
    try:
        ensure_mail_delivery_configured()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    now = _utc_now()

    email_clean = _normalize_email(payload.email)
    login_clean = _normalize_login(payload.login)
    display_name = (payload.display_name or login_clean).strip() or login_clean

    existing_email = db.scalar(select(User).where(User.email == email_clean))
    existing_login = db.scalar(select(User).where(User.login == login_clean))
    if existing_login is not None and (
        existing_email is None or existing_login.id != existing_email.id
    ):
        raise HTTPException(status_code=400, detail="Login already taken")

    if existing_email is not None:
        if existing_email.is_active or existing_email.email_verified_at is not None:
            raise HTTPException(status_code=400, detail="Email already registered")
        existing_email.login = login_clean
        existing_email.password_hash = hash_password(payload.password)
        existing_email.display_name = display_name
        existing_email.role = "user"
        existing_email.must_change_password = False
        existing_email.is_active = False
        existing_email.email_verified_at = None
        user = existing_email
    else:
        user = User(
            id=str(uuid.uuid4()),
            email=email_clean,
            login=login_clean,
            password_hash=hash_password(payload.password),
            display_name=display_name,
            role="user",
            must_change_password=False,
            is_active=False,
            email_verified_at=None,
        )
        db.add(user)
        db.flush()

    raw_code = _issue_email_code(db, user=user, email=email_clean, now=now)
    db.commit()
    _send_verification_code_or_fail(email_clean, raw_code)
    return {"ok": True}


@router.post("/verify-email")
def verify_email(
    payload: VerifyEmailRequest,
    response: Response,
    db: DBSession,
) -> dict[str, Any]:
    auth = get_settings().auth
    now = _utc_now()
    email_clean = _normalize_email(payload.email)
    code_clean = _normalize_code(payload.code, auth.email_code_length)

    user = db.scalar(select(User).where(User.email == email_clean))
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    if user.email_verified_at is not None and user.is_active:
        return _issue_session(db, user, response)

    verification = _latest_pending_code(db, user_id=user.id, email=email_clean)
    if verification is None:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    if _as_utc(verification.expires_at) < now:
        verification.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="Code expired")

    if verification.attempt_count >= auth.email_code_max_attempts:
        verification.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts")

    if not verify_email_code(code_clean, verification.code_hash):
        verification.attempt_count += 1
        if verification.attempt_count >= auth.email_code_max_attempts:
            verification.consumed_at = now
            db.commit()
            raise HTTPException(status_code=400, detail="Too many attempts")
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code")

    verification.consumed_at = now
    user.email_verified_at = now
    user.is_active = True
    db.commit()
    db.refresh(user)
    return _issue_session(db, user, response)


@router.post("/resend-verification")
def resend_verification(payload: ResendVerificationRequest, db: DBSession) -> dict[str, bool]:
    email_clean = _normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email_clean))
    if user is None or user.is_active or user.email_verified_at is not None:
        return {"ok": True}

    now = _utc_now()
    auth = get_settings().auth
    active_code = _latest_pending_code(db, user_id=user.id, email=email_clean)
    if active_code is not None:
        if _as_utc(active_code.expires_at) < now:
            active_code.consumed_at = now
        else:
            delta_sec = (now - _as_utc(active_code.last_sent_at)).total_seconds()
            if delta_sec < auth.email_code_resend_cooldown_seconds:
                db.commit()
                return {"ok": True}

    raw_code = _issue_email_code(db, user=user, email=email_clean, now=now)
    db.commit()
    try:
        _send_verification_code_or_fail(email_clean, raw_code)
    except Exception:
        # Keep response generic to avoid account enumeration.
        logger.exception("resend verification email failed")
    return {"ok": True}


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
        email=None,
        login=login_clean,
        password_hash=hash_password(payload.password),
        display_name=(payload.display_name or login_clean).strip() or login_clean,
        role="user",
        must_change_password=False,
        is_active=True,
        email_verified_at=None,
    )
    db.add(user)
    db.flush()
    invite.used_at = now
    invite.used_by_user_id = user.id
    db.commit()
    db.refresh(user)
    return _issue_session(db, user, response)
