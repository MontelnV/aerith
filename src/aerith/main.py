"""AERITH FastAPI app."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update

from aerith.auth.seed import seed_admin_if_missing
from aerith.config import get_settings
from aerith.db.models import DatasetConnection
from aerith.db.session import app_session
from aerith.db.storage import run_migrations
from aerith.routers import admin as admin_router
from aerith.routers import auth as auth_router
from aerith.routers import chats as chats_router
from aerith.routers import datasets as datasets_router
from aerith.routers import llm as llm_router
from aerith.routers import marketplace as marketplace_router
from aerith.services.health import collect_health

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


def _sweep_zombie_datasets() -> None:
    session = app_session()
    try:
        stmt = (
            update(DatasetConnection)
            .where(DatasetConnection.status.in_(("uploading", "processing")))
            .values(
                status="failed",
                status_error="Server restarted during ingestion",
                status_updated_at=datetime.now(timezone.utc),
            )
        )
        result = session.execute(stmt)
        session.commit()
        if result.rowcount:
            logger.info("Reset %s zombie dataset(s) to failed", result.rowcount)
    except Exception:
        logger.exception("Zombie-dataset sweep failed")
        session.rollback()
    finally:
        session.close()


def _warn_insecure_defaults() -> None:
    auth = get_settings().auth
    if auth.jwt_secret == "change-me-in-production":
        logger.warning(
            "SECURITY: AUTH__JWT_SECRET is the built-in default. "
            "Set a strong secret before exposing this instance."
        )
    if auth.seed_admin_password == "admin":
        logger.warning(
            "SECURITY: seed admin password is 'admin'. "
            "Set AUTH__SEED_ADMIN_PASSWORD or change it after first login."
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _warn_insecure_defaults()
    try:
        await asyncio.to_thread(run_migrations)
        await asyncio.to_thread(seed_admin_if_missing)
        await asyncio.to_thread(_sweep_zombie_datasets)
    except Exception:
        logger.exception("Startup bootstrap failed")
        raise

    yield


app = FastAPI(title="AERITH API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return collect_health()


app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(chats_router.router)
app.include_router(datasets_router.router)
app.include_router(llm_router.router)
app.include_router(marketplace_router.router)
