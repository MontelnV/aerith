"""JWT, password hashing, invite/email-code, and data-at-rest helpers."""

from __future__ import annotations

import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken

from aerith.config import get_settings


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(password), hashed.encode("ascii"))
    except Exception:
        return False


def _fernet() -> Fernet:
    auth = get_settings().auth
    key = (auth.data_key or "").strip()
    if not key:
        digest = hashlib.sha256(auth.jwt_secret.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest).decode("ascii")
    else:
        if len(base64.urlsafe_b64decode(key + "=" * (-len(key) % 4))) != 32:
            raise RuntimeError("auth.data_key must be a 32-byte urlsafe-base64 string")
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return ""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def issue_access_token(user_id: str, *, role: str) -> tuple[str, datetime]:
    auth = get_settings().auth
    exp = _now() + timedelta(minutes=auth.access_ttl_minutes)
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": int(_now().timestamp()),
        "exp": int(exp.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, auth.jwt_secret, algorithm=auth.jwt_algorithm)
    return token, exp


def issue_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at)."""
    auth = get_settings().auth
    jti = uuid.uuid4().hex
    exp = _now() + timedelta(days=auth.refresh_ttl_days)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": int(_now().timestamp()),
        "exp": int(exp.timestamp()),
        "jti": jti,
    }
    token = jwt.encode(payload, auth.jwt_secret, algorithm=auth.jwt_algorithm)
    return token, jti, exp


def decode_token(token: str) -> dict[str, Any] | None:
    auth = get_settings().auth
    try:
        return jwt.decode(token, auth.jwt_secret, algorithms=[auth.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def generate_invite_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash). Raw is shown once; hash is stored."""
    raw = secrets.token_urlsafe(32)
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, h


def hash_invite_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_email_code(length: int | None = None) -> str:
    auth = get_settings().auth
    code_length = length or auth.email_code_length
    if code_length < 4:
        raise RuntimeError("auth.email_code_length must be >= 4")
    return "".join(str(secrets.randbelow(10)) for _ in range(code_length))


def hash_email_code(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def verify_email_code(raw: str, code_hash: str) -> bool:
    return secrets.compare_digest(hash_email_code(raw), code_hash)
