"""Dataset connections: external Postgres + CSV/XLSX uploads + visibility."""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from aerith.auth.dependencies import CurrentFreshUser, DBSession
from aerith.auth.security import encrypt_secret
from aerith.config import get_settings
from aerith.db.models import DatasetConnection
from aerith.db.session import app_session
from aerith.instruments import analytics_db as adb
from aerith.services.dataset_import import (
    drop_dataset,
    parse_upload_path,
    persist_dataset,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

DATASET_NAME_MAX = 80
DATASET_DESCRIPTION_MAX = 280


def _validated_name(raw: str, *, fallback: str = "Dataset") -> str:
    s = (raw or "").strip() or fallback
    if len(s) > DATASET_NAME_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Name must be at most {DATASET_NAME_MAX} characters",
        )
    return s


def _validated_description(raw: str) -> str:
    s = (raw or "").strip()
    if len(s) > DATASET_DESCRIPTION_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Description must be at most {DATASET_DESCRIPTION_MAX} characters",
        )
    return s


def _ds_dict(d: DatasetConnection, *, owner_login: str | None = None) -> dict[str, Any]:
    return {
        "id": d.id,
        "name": d.name,
        "description": d.description,
        "kind": d.kind,
        "visibility": d.visibility,
        "owner_user_id": d.owner_user_id,
        "owner_login": owner_login,
        "host": d.host,
        "port": d.port,
        "database_name": d.database_name,
        "username": d.username,
        "ssl_mode": d.ssl_mode,
        "uploaded_row_count": d.uploaded_row_count,
        "uploaded_columns": d.uploaded_columns,
        "source_filename": d.source_filename,
        "status": d.status,
        "status_error": d.status_error,
        "status_updated_at": d.status_updated_at.isoformat()
        if d.status_updated_at
        else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.get("")
def list_datasets(user: CurrentFreshUser, db: DBSession) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(DatasetConnection)
        .where(DatasetConnection.owner_user_id == user.id)
        .order_by(DatasetConnection.updated_at.desc())
    ).all()
    return [_ds_dict(d) for d in rows]


class ExternalCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=DATASET_NAME_MAX)
    description: str = Field(default="", max_length=DATASET_DESCRIPTION_MAX)
    host: str = Field(min_length=1)
    port: int = Field(default=5432, ge=1, le=65535)
    database_name: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    ssl_mode: str = "prefer"


@router.post("/external")
def create_external(payload: ExternalCreateRequest, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    """Create a connection to an external Postgres database.

    Before commit we verify credentials work; otherwise the gallery would show
    a broken connection. On failure we return 400 with a readable error and
    write nothing to the database.
    """
    d = DatasetConnection(
        id=str(uuid.uuid4()),
        owner_user_id=user.id,
        name=_validated_name(payload.name),
        description=_validated_description(payload.description),
        kind="external_pg",
        visibility="private",
        host=payload.host.strip(),
        port=payload.port,
        database_name=payload.database_name.strip(),
        username=payload.username.strip(),
        password_encrypted=encrypt_secret(payload.password),
        ssl_mode=payload.ssl_mode.strip() or "prefer",
        status="ready",
    )
    try:
        adb.test_connection(_dataset_to_rec(d))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not connect: {exc}",
        ) from exc
    db.add(d)
    db.commit()
    db.refresh(d)
    return _ds_dict(d)


class ExternalPatchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=DATASET_NAME_MAX)
    description: str | None = Field(default=None, max_length=DATASET_DESCRIPTION_MAX)
    host: str | None = None
    port: int | None = None
    database_name: str | None = None
    username: str | None = None
    password: str | None = None
    ssl_mode: str | None = None


@router.patch("/{ds_id}")
def patch_dataset(ds_id: str, payload: ExternalPatchRequest, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    d = db.get(DatasetConnection, ds_id)
    if d is None or d.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if payload.name is not None:
        d.name = _validated_name(payload.name)
    if payload.description is not None:
        d.description = _validated_description(payload.description)
    conn_changed = False
    if d.kind == "external_pg":
        if payload.host is not None:
            d.host = payload.host.strip()
            conn_changed = True
        if payload.port is not None:
            d.port = int(payload.port)
            conn_changed = True
        if payload.database_name is not None:
            d.database_name = payload.database_name.strip()
            conn_changed = True
        if payload.username is not None:
            d.username = payload.username.strip()
            conn_changed = True
        if payload.password is not None and payload.password.strip():
            d.password_encrypted = encrypt_secret(payload.password)
            conn_changed = True
        if payload.ssl_mode is not None:
            d.ssl_mode = payload.ssl_mode.strip() or "prefer"
            conn_changed = True
        if conn_changed:
            try:
                adb.test_connection(_dataset_to_rec(d))
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not connect with the new credentials: {exc}",
                ) from exc
    db.commit()
    db.refresh(d)
    return _ds_dict(d)


class VisibilityRequest(BaseModel):
    visibility: str = Field(pattern=r"^(public|private)$")


@router.patch("/{ds_id}/visibility")
def set_visibility(ds_id: str, payload: VisibilityRequest, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    d = db.get(DatasetConnection, ds_id)
    if d is None or d.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    d.visibility = payload.visibility
    db.commit()
    db.refresh(d)
    return _ds_dict(d)


@router.delete("/{ds_id}")
def delete_dataset(ds_id: str, user: CurrentFreshUser, db: DBSession) -> dict[str, bool]:
    d = db.get(DatasetConnection, ds_id)
    if d is None or d.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if d.kind == "uploaded" and d.uploaded_schema and d.uploaded_table:
        try:
            drop_dataset(d.uploaded_schema, d.uploaded_table)
        except Exception:
            pass
    db.delete(d)
    db.commit()
    return {"deleted": True}


@router.post("/{ds_id}/test")
def test_dataset(ds_id: str, user: CurrentFreshUser, db: DBSession) -> dict[str, Any]:
    d = db.get(DatasetConnection, ds_id)
    if d is None or d.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    rec = _dataset_to_rec(d)
    try:
        info = _rich_test_info(d, rec)
        return {"ok": True, "info": info}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _rich_test_info(d: DatasetConnection, rec: dict[str, Any]) -> dict[str, Any]:
    base = adb.test_connection(rec)
    info: dict[str, Any] = {
        "kind": d.kind,
        "database": base.get("db"),
        "user": base.get("user"),
    }
    try:
        with adb.open_readonly_connection(
            adb.rec_with_plaintext_password(rec)
        ) as conn:
            if d.kind == "uploaded" and d.uploaded_schema and d.uploaded_table:
                info["schema"] = d.uploaded_schema
                info["table"] = d.uploaded_table
                ident = f'"{d.uploaded_schema}"."{d.uploaded_table}"'
                row = conn.execute(
                    f"SELECT COUNT(*) AS c FROM {ident}"  # noqa: S608 — idents already quoted
                ).fetchone()
                if row:
                    info["row_count"] = int(row.get("c") or 0)
                cols = conn.execute(
                    "SELECT COUNT(*) AS c FROM information_schema.columns "
                    "WHERE table_schema = %s AND table_name = %s",
                    (d.uploaded_schema, d.uploaded_table),
                ).fetchone()
                if cols:
                    info["column_count"] = int(cols.get("c") or 0)
            else:
                ver = conn.execute("SELECT version() AS v").fetchone()
                if ver:
                    info["server_version"] = str(ver.get("v") or "").split(" on ")[0]
                tables = conn.execute(
                    "SELECT COUNT(*) AS c FROM information_schema.tables "
                    "WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"
                ).fetchone()
                if tables:
                    info["table_count"] = int(tables.get("c") or 0)
    except Exception as exc:
        logger.warning("rich test-info enrichment failed for %s: %s", d.id, exc)
    return info


PREVIEW_SAMPLE_LIMIT = 10


@router.get("/{ds_id}/preview")
def preview_dataset(
    ds_id: str,
    user: CurrentFreshUser,
    db: DBSession,
    schema: str | None = None,
    table: str | None = None,
) -> dict[str, Any]:
    """Columns and sample rows for a dataset.

    Uploaded datasets resolve their schema/table automatically. External
    databases return the table list first; pass ?schema=&table= to inspect one.
    Available to the owner and, for public datasets, to everyone (marketplace).
    """
    d = db.get(DatasetConnection, ds_id)
    if d is None or (d.owner_user_id != user.id and d.visibility != "public"):
        raise HTTPException(status_code=404, detail="Dataset not found")
    if d.status != "ready":
        raise HTTPException(status_code=400, detail="Dataset is not ready yet")

    rec = _dataset_to_rec(d)
    out: dict[str, Any] = {
        "id": d.id,
        "kind": d.kind,
        "name": d.name,
        "description": d.description,
        "row_count": d.uploaded_row_count,
    }

    if d.kind == "uploaded":
        schema, table = d.uploaded_schema, d.uploaded_table
        if not schema or not table:
            raise HTTPException(status_code=400, detail="Dataset has no table")

    try:
        if not table:
            out["tables"] = [
                {"schema": t["table_schema"], "table": t["table_name"]}
                for t in adb.list_tables(rec, schema)
            ]
            return out
        out["schema"] = schema
        out["table"] = table
        out["columns"] = [
            {
                "name": c["column_name"],
                "type": c["data_type"],
                "nullable": c["is_nullable"] == "YES",
            }
            for c in adb.describe_table(rec, schema or "", table)
        ]
        out["rows"] = adb.sample_rows(rec, schema or "", table, PREVIEW_SAMPLE_LIMIT)
        return out
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Preview failed: {exc}") from exc


def _dataset_to_rec(d: DatasetConnection) -> dict[str, Any]:
    return {
        "id": d.id,
        "name": d.name,
        "kind": d.kind,
        "host": d.host,
        "port": d.port,
        "database_name": d.database_name,
        "username": d.username,
        "password_encrypted": d.password_encrypted,
        "ssl_mode": d.ssl_mode,
        "uploaded_schema": d.uploaded_schema,
        "uploaded_table": d.uploaded_table,
    }


def _upload_tmp_dir() -> str:
    path = get_settings().datasets.upload_tmp_dir or tempfile.gettempdir()
    try:
        os.makedirs(path, exist_ok=True)
    except OSError:
        path = tempfile.gettempdir()
    return path


async def _stream_to_tmp(file: UploadFile, max_bytes: int) -> tuple[str, int]:
    """Stream ``file`` body into a temp file. Returns (path, total_bytes)."""
    dir_ = _upload_tmp_dir()
    fd, tmp_path = tempfile.mkstemp(prefix="aerith-ds-", suffix=".bin", dir=dir_)
    total = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large (max {get_settings().datasets.max_upload_mb} MB)",
                    )
                out.write(chunk)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    return tmp_path, total


def _run_ingest_sync(conn_id: str, tmp_path: str, filename: str) -> None:
    """Synchronous ingestion used by the background task.

    Opens its own DB session because the original request scope is gone.
    """
    session = app_session()
    try:
        d = session.get(DatasetConnection, conn_id)
        if d is None:
            logger.warning("ingest: dataset %s disappeared before processing", conn_id)
            return

        try:
            df = parse_upload_path(filename, tmp_path)
            info = persist_dataset(d.owner_user_id, conn_id, df)
        except Exception as exc:
            logger.exception("ingest failed for %s", conn_id)
            d.status = "failed"
            d.status_error = str(exc)[:500] or "Unknown error"
            d.status_updated_at = datetime.now(timezone.utc)
            session.commit()
            return

        d.uploaded_schema = info["schema"]
        d.uploaded_table = info["table"]
        d.uploaded_row_count = info["row_count"]
        d.uploaded_columns = {"columns": info["columns"]}
        d.status = "ready"
        d.status_error = None
        d.status_updated_at = datetime.now(timezone.utc)
        session.commit()
    finally:
        session.close()
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


_INGEST_TASKS: set[asyncio.Task] = set()


def _schedule_ingest(conn_id: str, tmp_path: str, filename: str) -> None:
    """Kick off background ingestion via ``asyncio.to_thread``.

    Keep a strong reference to the task in a module-level set so GC cannot
    drop it before completion (see https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task).
    """
    loop = asyncio.get_running_loop()
    task = loop.create_task(
        asyncio.to_thread(_run_ingest_sync, conn_id, tmp_path, filename)
    )
    _INGEST_TASKS.add(task)
    task.add_done_callback(_INGEST_TASKS.discard)


@router.post("/upload")
async def upload_dataset(
    user: CurrentFreshUser,
    db: DBSession,
    file: UploadFile = File(...),
    name: str = Form(""),
    description: str = Form(""),
) -> dict[str, Any]:
    settings = get_settings().datasets
    max_per_user = settings.max_per_user
    max_bytes = max(1, settings.max_upload_mb) * 1024 * 1024

    existing_uploads = db.scalars(
        select(DatasetConnection).where(
            DatasetConnection.owner_user_id == user.id,
            DatasetConnection.kind == "uploaded",
        )
    ).all()
    if len(existing_uploads) >= max_per_user:
        raise HTTPException(status_code=400, detail=f"Upload limit reached ({max_per_user})")

    tmp_path, total = await _stream_to_tmp(file, max_bytes)
    if total == 0:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise HTTPException(status_code=400, detail="Empty file")

    conn_id = str(uuid.uuid4())
    if name.strip():
        display_name = _validated_name(name)
    else:
        base = (file.filename or "Dataset").rsplit(".", 1)[0] or "Dataset"
        display_name = base[:DATASET_NAME_MAX]
    d = DatasetConnection(
        id=conn_id,
        owner_user_id=user.id,
        name=display_name,
        description=_validated_description(description),
        kind="uploaded",
        visibility="private",
        source_filename=file.filename or "",
        status="processing",
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    _schedule_ingest(conn_id, tmp_path, file.filename or "upload.csv")

    return _ds_dict(d)


@router.post("/{ds_id}/retry")
async def retry_dataset(
    ds_id: str,
    user: CurrentFreshUser,
    db: DBSession,
    file: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    """Retry ingestion for a failed dataset.

    The temp file from the original upload is already deleted by that point,
    so the client re-uploads the same file. We only reuse the existing row
    (preserving name/description/visibility).
    """
    d = db.get(DatasetConnection, ds_id)
    if d is None or d.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if d.kind != "uploaded":
        raise HTTPException(status_code=400, detail="Only uploaded datasets can be retried")
    if d.status == "ready":
        raise HTTPException(status_code=400, detail="Dataset already processed")
    if file is None:
        raise HTTPException(
            status_code=400,
            detail="Upload the source file again to retry",
        )

    settings = get_settings().datasets
    max_bytes = max(1, settings.max_upload_mb) * 1024 * 1024
    tmp_path, total = await _stream_to_tmp(file, max_bytes)
    if total == 0:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise HTTPException(status_code=400, detail="Empty file")

    d.status = "processing"
    d.status_error = None
    d.status_updated_at = datetime.now(timezone.utc)
    if file.filename:
        d.source_filename = file.filename
    db.commit()
    db.refresh(d)

    _schedule_ingest(ds_id, tmp_path, file.filename or d.source_filename or "upload.csv")

    return _ds_dict(d)
