"""BYOK LLM providers, per-chat model selection, drop unused artifact tables

Revision ID: 0009_llm_providers
Revises: 0008_chat_web_search
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_llm_providers"
down_revision: Union[str, None] = "0008_chat_web_search"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_providers",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=False, server_default=""),
        sa.Column("models", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column(
            "is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
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
    op.create_index("ix_llm_providers_user_id", "llm_providers", ["user_id"])

    op.add_column(
        "chats",
        sa.Column(
            "llm_provider_id",
            sa.String(64),
            sa.ForeignKey("llm_providers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("chats", sa.Column("llm_model", sa.Text(), nullable=True))

    # Tables created in earlier revisions but never exposed via API or UI.
    op.drop_table("chart_artifacts")
    op.drop_table("saved_artifacts")


def downgrade() -> None:
    op.drop_column("chats", "llm_model")
    op.drop_column("chats", "llm_provider_id")
    op.drop_index("ix_llm_providers_user_id", table_name="llm_providers")
    op.drop_table("llm_providers")
