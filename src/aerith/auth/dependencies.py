"""FastAPI auth dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from aerith.auth.security import decode_token
from aerith.db.models import User
from aerith.db.session import db_dep


def get_current_user(
    db: Annotated[Session, Depends(db_dep)],
    aerith_session: str | None = Cookie(default=None, alias="aerith_session"),
) -> User:
    token = aerith_session
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user_id = str(payload.get("sub") or "")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def require_password_fresh(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(require_admin)]
CurrentFreshUser = Annotated[User, Depends(require_password_fresh)]
DBSession = Annotated[Session, Depends(db_dep)]
