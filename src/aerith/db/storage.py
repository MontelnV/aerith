"""DB bootstrap: runs Alembic migrations at startup."""

from __future__ import annotations

import logging

from alembic import command
from alembic.config import Config

from aerith.config import PROJECT_ROOT, get_database_url

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", get_database_url())
    command.upgrade(cfg, "head")
    logger.info("Alembic migrations applied")
