"""SQLAlchemy engines: application metadata + user datasets Postgres."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def create_engine_from_url(database_url: str) -> Engine:
    return create_engine(
        database_url,
        future=True,
        pool_pre_ping=True,
    )


def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        future=True,
    )
