"""Marketplace: browse public datasets."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from aerith.auth.dependencies import CurrentFreshUser, DBSession
from aerith.db.models import DatasetConnection, User

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


@router.get("/datasets")
def list_public_datasets(user: CurrentFreshUser, db: DBSession) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(DatasetConnection)
        .where(DatasetConnection.visibility == "public")
        .order_by(DatasetConnection.updated_at.desc())
    ).all()
    out: list[dict[str, Any]] = []
    for d in rows:
        owner = db.get(User, d.owner_user_id)
        out.append({
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "kind": d.kind,
            "owner_login": owner.login if owner else None,
            "owner_display_name": owner.display_name if owner else None,
            "uploaded_row_count": d.uploaded_row_count,
            "uploaded_columns": d.uploaded_columns,
            "source_filename": d.source_filename,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        })
    return out
