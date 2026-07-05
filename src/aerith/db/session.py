"""Shared engine/session instances, created lazily."""

from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from aerith.config import get_database_url, get_datasets_database_url
from aerith.db.engine import create_engine_from_url, session_factory


@lru_cache
def get_app_engine() -> Engine:
    return create_engine_from_url(get_database_url())


@lru_cache
def get_datasets_engine() -> Engine:
    return create_engine_from_url(get_datasets_database_url())


@lru_cache
def _app_session_factory():
    return session_factory(get_app_engine())


def app_session() -> Session:
    return _app_session_factory()()


def db_dep() -> Generator[Session, None, None]:
    s = app_session()
    try:
        yield s
    finally:
        s.close()
