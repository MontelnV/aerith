"""dataset ingestion status

Revision ID: 0003_dataset_status
Revises: 0002_saved_artifacts
Create Date: 2026-04-18
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_dataset_status"
down_revision = "0002_saved_artifacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_connections",
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="ready",
        ),
    )
    op.add_column(
        "dataset_connections",
        sa.Column("status_error", sa.Text(), nullable=True),
    )
    op.add_column(
        "dataset_connections",
        sa.Column(
            "status_updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_dataset_connections_status",
        "dataset_connections",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dataset_connections_status",
        table_name="dataset_connections",
    )
    op.drop_column("dataset_connections", "status_updated_at")
    op.drop_column("dataset_connections", "status_error")
    op.drop_column("dataset_connections", "status")
