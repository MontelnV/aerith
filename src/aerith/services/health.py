"""Health checks for operations."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text

from aerith.config import get_settings

logger = logging.getLogger(__name__)


def _pg_ok(url: str) -> bool:
    if not url:
        return False
    try:
        from aerith.db.engine import create_engine_from_url

        engine = create_engine_from_url(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.debug("postgres check failed: %s", exc)
        return False


def collect_health() -> dict[str, Any]:
    settings = get_settings()
    app_ok = _pg_ok(settings.resolved_database_url)
    datasets_ok = _pg_ok(settings.resolved_datasets_url)

    overall = "ok" if app_ok and datasets_ok else "degraded"

    return {
        "status": overall,
        "service": "aerith",
        "postgres_app": app_ok,
        "postgres_datasets": datasets_ok,
    }
