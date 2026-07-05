"""saved artifacts library (charts + tables)

Revision ID: 0002_saved_artifacts
Revises: 0001_initial
Create Date: 2026-04-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_saved_artifacts"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_artifacts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chat_id",
            sa.String(64),
            sa.ForeignKey("chats.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "message_id",
            sa.Integer(),
            sa.ForeignKey("messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(16), nullable=False, server_default="chart"),
        sa.Column("title", sa.Text(), nullable=False, server_default=""),
        sa.Column("spec", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("data", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_saved_artifacts_user_id", "saved_artifacts", ["user_id"])
    op.create_index("ix_saved_artifacts_chat_id", "saved_artifacts", ["chat_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_artifacts_chat_id", table_name="saved_artifacts")
    op.drop_index("ix_saved_artifacts_user_id", table_name="saved_artifacts")
    op.drop_table("saved_artifacts")
