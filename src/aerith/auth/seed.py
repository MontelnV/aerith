"""Seed initial administrator account from configuration."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select

from aerith.auth.security import hash_password
from aerith.config import get_settings
from aerith.db.models import User
from aerith.db.session import app_session

logger = logging.getLogger(__name__)


def seed_admin_if_missing() -> None:
    auth = get_settings().auth
    login = (auth.seed_admin_login or "").strip()
    password = auth.seed_admin_password or ""
    if not login or not password:
        return
    with app_session() as s:
        existing_admin = s.scalar(select(User).where(User.role == "admin"))
        if existing_admin is not None:
            return
        existing_login = s.scalar(select(User).where(User.login == login))
        if existing_login is not None:
            existing_login.role = "admin"
            existing_login.is_active = True
            s.commit()
            logger.info("Promoted existing user %s to admin", login)
            return
        user = User(
            id=str(uuid.uuid4()),
            login=login,
            password_hash=hash_password(password),
            display_name=(auth.seed_admin_display_name or login).strip() or login,
            role="admin",
            must_change_password=True,
            is_active=True,
        )
        s.add(user)
        s.commit()
        logger.info("Seeded admin user %s", login)
