"""initial aerith schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("login", sa.String(120), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False, server_default=""),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("theme", sa.String(16), nullable=False, server_default="dark"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_login", "users", ["login"])

    op.create_table(
        "invites",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("created_by_user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("jti", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "dataset_connections",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("owner_user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("kind", sa.String(16), nullable=False, server_default="external_pg"),
        sa.Column("visibility", sa.String(16), nullable=False, server_default="private"),
        sa.Column("host", sa.Text(), nullable=False, server_default=""),
        sa.Column("port", sa.Integer(), nullable=False, server_default="5432"),
        sa.Column("database_name", sa.Text(), nullable=False, server_default=""),
        sa.Column("username", sa.Text(), nullable=False, server_default=""),
        sa.Column("password_encrypted", sa.Text(), nullable=False, server_default=""),
        sa.Column("ssl_mode", sa.Text(), nullable=False, server_default="prefer"),
        sa.Column("uploaded_schema", sa.Text(), nullable=True),
        sa.Column("uploaded_table", sa.Text(), nullable=True),
        sa.Column("uploaded_row_count", sa.Integer(), nullable=True),
        sa.Column("uploaded_columns", sa.JSON(), nullable=True),
        sa.Column("source_filename", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_dataset_connections_owner", "dataset_connections", ["owner_user_id"])

    op.create_table(
        "chats",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False, server_default="New chat"),
        sa.Column("chat_mode", sa.String(16), nullable=False, server_default="chat"),
        sa.Column("analytics_charts_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_chats_user_id", "chats", ["user_id"])

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("chat_id", sa.String(64), sa.ForeignKey("chats.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(16), nullable=False, server_default="complete"),
        sa.Column("elapsed_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_messages_chat_id", "messages", ["chat_id"])

    op.create_table(
        "chat_dataset_links",
        sa.Column("chat_id", sa.String(64), sa.ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("dataset_connection_id", sa.String(64), sa.ForeignKey("dataset_connections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("chat_id", "dataset_connection_id", name="uq_chat_dataset"),
    )

    op.create_table(
        "chart_artifacts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chat_id", sa.String(64), sa.ForeignKey("chats.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False, server_default=""),
        sa.Column("spec", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("data", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("forked_from_id", sa.String(64), sa.ForeignKey("chart_artifacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_chart_artifacts_chat_id", "chart_artifacts", ["chat_id"])
    op.create_index("ix_chart_artifacts_user_id", "chart_artifacts", ["user_id"])


def downgrade() -> None:
    op.drop_table("chart_artifacts")
    op.drop_table("chat_dataset_links")
    op.drop_table("messages")
    op.drop_table("chats")
    op.drop_table("dataset_connections")
    op.drop_table("refresh_tokens")
    op.drop_table("invites")
    op.drop_table("users")
