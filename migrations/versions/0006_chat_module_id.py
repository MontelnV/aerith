"""chats: module_id for per-module chat lists

Revision ID: 0006_chat_module_id
Revises: 0003_dataset_status
Create Date: 2026-05-26 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_chat_module_id"
down_revision: Union[str, None] = "0003_dataset_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "chats",
        sa.Column(
            "module_id",
            sa.String(32),
            nullable=False,
            server_default=sa.text("'analytics'"),
        ),
    )
    op.create_index("ix_chats_user_module", "chats", ["user_id", "module_id"])


def downgrade():
    op.drop_index("ix_chats_user_module", table_name="chats")
    op.drop_column("chats", "module_id")
