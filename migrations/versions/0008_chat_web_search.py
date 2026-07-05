"""Per-chat web search toggle and message citation storage

Revision ID: 0008_chat_web_search
Revises: 0006_chat_module_id
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_chat_web_search"
down_revision: Union[str, None] = "0006_chat_module_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "chats",
        sa.Column(
            "web_search_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "messages",
        sa.Column("annotations", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("messages", "annotations")
    op.drop_column("chats", "web_search_enabled")
