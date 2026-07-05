"""Read-only PostgreSQL access: works with both external and uploaded connections."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import quote_plus

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from aerith.auth.security import decrypt_secret
from aerith.config import get_datasets_database_url

_FORBIDDEN_SQL = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|"
    r"COPY\s+FROM|COPY\s+TO|CALL|EXECUTE|DO\s*\(|VACUUM|ANALYZE\s+VERBOSE)\b",
    re.IGNORECASE | re.DOTALL,
)


def _validate_select_only(sql_text: str) -> None:
    raw = (sql_text or "").strip()
    if not raw:
        raise ValueError("Empty SQL")
    if _FORBIDDEN_SQL.search(raw):
        raise ValueError("Only read-only SELECT queries are allowed")
    upper = raw.lstrip().upper()
    if not (upper.startswith("SELECT") or upper.startswith("WITH")):
        raise ValueError("Query must start with SELECT or WITH")
    semis = [i for i, c in enumerate(raw) if c == ";"]
    if semis and semis[-1] < len(raw) - 1:
        raise ValueError("Multiple statements are not allowed")


def _sqlalchemy_url_to_dsn(url: str) -> str:
    """Convert postgresql+psycopg://... to postgresql://..."""
    if url.startswith("postgresql+psycopg://"):
        return "postgresql://" + url[len("postgresql+psycopg://"):]
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url[len("postgresql+psycopg2://"):]
    return url


def connection_dsn_from_record(rec: dict[str, Any]) -> str:
    """Build a psycopg DSN for either external_pg or uploaded dataset connections."""
    kind = str(rec.get("kind") or "external_pg")
    if kind == "uploaded":
        return _sqlalchemy_url_to_dsn(get_datasets_database_url())
    host = str(rec.get("host") or "").strip()
    port = int(rec.get("port") or 5432)
    db = str(rec.get("database_name") or "").strip()
    user = str(rec.get("username") or "").strip()
    password = str(rec.get("password") or "")
    sslmode = str(rec.get("ssl_mode") or "prefer").strip()
    if not host or not db or not user:
        raise ValueError("Incomplete connection parameters")
    u = quote_plus(user)
    p = quote_plus(password)
    return f"postgresql://{u}:{p}@{host}:{port}/{quote_plus(db)}?sslmode={quote_plus(sslmode)}"


def rec_with_plaintext_password(rec: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of rec with 'password' field decrypted for external_pg kind."""
    if rec.get("kind") != "external_pg":
        return rec
    enc = str(rec.get("password_encrypted") or "")
    out = dict(rec)
    out["password"] = decrypt_secret(enc) if enc else ""
    return out


def scope_schema(rec: dict[str, Any]) -> str | None:
    """Schema that the agent is allowed to query. None means any (external)."""
    if rec.get("kind") == "uploaded":
        return str(rec.get("uploaded_schema") or "")
    return None


def open_readonly_connection(rec: dict[str, Any]) -> psycopg.Connection:
    rec2 = rec_with_plaintext_password(rec)
    dsn = connection_dsn_from_record(rec2)
    conn = psycopg.connect(dsn, row_factory=dict_row)
    conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    return conn


def test_connection(rec: dict[str, Any]) -> dict[str, Any]:
    with open_readonly_connection(rec) as conn:
        row = conn.execute("SELECT current_database() AS db, current_user AS user").fetchone()
    return dict(row or {})


def list_tables(rec: dict[str, Any], schema: str | None = None) -> list[dict[str, Any]]:
    s = schema or scope_schema(rec) or "public"
    q = """
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = %s
    ORDER BY table_name
    """
    with open_readonly_connection(rec) as conn:
        rows = conn.execute(q, (s,)).fetchall()
    return [dict(r) for r in rows]


def describe_table(rec: dict[str, Any], schema: str, table: str) -> list[dict[str, Any]]:
    s = (schema or scope_schema(rec) or "public").strip()
    t = (table or "").strip()
    if not t:
        raise ValueError("table is required")
    q = """
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = %s AND table_name = %s
    ORDER BY ordinal_position
    """
    with open_readonly_connection(rec) as conn:
        rows = conn.execute(q, (s, t)).fetchall()
    return [dict(r) for r in rows]


def _table_ident(schema: str, table: str) -> sql.Composed:
    return sql.SQL("{}.{}").format(sql.Identifier(schema), sql.Identifier(table))


def sample_rows(rec: dict[str, Any], schema: str, table: str, limit: int = 20) -> list[dict[str, Any]]:
    s = (schema or scope_schema(rec) or "public").strip()
    t = (table or "").strip()
    if not t:
        raise ValueError("table is required")
    lim = max(1, min(int(limit), 200))
    q = sql.SQL("SELECT * FROM {} LIMIT %s").format(_table_ident(s, t))
    with open_readonly_connection(rec) as conn:
        rows = conn.execute(q, (lim,)).fetchall()
    return [dict(r) for r in rows]


def run_select_query(rec: dict[str, Any], sql_text: str) -> list[dict[str, Any]]:
    _validate_select_only(sql_text)
    scope = scope_schema(rec)
    with open_readonly_connection(rec) as conn:
        if scope:
            conn.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(scope)))
        rows = conn.execute(sql_text).fetchall()
    return [dict(r) for r in rows]


def json_dumps_safe(obj: Any, max_len: int = 120_000) -> str:
    s = json.dumps(obj, ensure_ascii=False, default=str)
    if len(s) > max_len:
        return s[:max_len] + "\n... [truncated]"
    return s
