"""Parse uploaded CSV/XLSX and persist into datasets_db under per-user schema."""

from __future__ import annotations

import re
from typing import Any

import pandas as pd
from sqlalchemy import text

from aerith.db.session import get_datasets_engine

_IDENT_RE = re.compile(r"[^a-zA-Z0-9_]+")


def _safe_ident(name: str, fallback: str = "col") -> str:
    s = _IDENT_RE.sub("_", name.strip().lower()).strip("_")
    if not s:
        s = fallback
    if s[0].isdigit():
        s = f"c_{s}"
    return s[:60]


def user_schema_name(user_id: str) -> str:
    safe = _IDENT_RE.sub("_", user_id.lower())
    return f"u_{safe[:48]}"


def dataset_table_name(connection_id: str) -> str:
    safe = _IDENT_RE.sub("_", connection_id.lower())
    return f"ds_{safe[:48]}"


def _infer_sqlalchemy_dtype(series: pd.Series) -> str:
    dt = str(series.dtype)
    if dt.startswith("int"):
        return "bigint"
    if dt.startswith("float"):
        return "double precision"
    if dt.startswith("bool"):
        return "boolean"
    if "datetime" in dt:
        return "timestamp"
    return "text"


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    seen: dict[str, int] = {}
    new_cols: list[str] = []
    for c in df.columns:
        base = _safe_ident(str(c))
        if base in seen:
            seen[base] += 1
            base = f"{base}_{seen[base]}"
        else:
            seen[base] = 0
        new_cols.append(base)
    df.columns = new_cols
    return df


def parse_upload_path(filename: str, path: str) -> pd.DataFrame:
    name = (filename or "").lower()
    if name.endswith(".csv") or name.endswith(".tsv") or name.endswith(".txt"):
        sep = "\t" if name.endswith(".tsv") else None
        df = pd.read_csv(path, sep=sep, engine="python")
    elif name.endswith(".xlsx") or name.endswith(".xls"):
        df = pd.read_excel(path)
    else:
        raise ValueError("Unsupported file type. Use .csv, .tsv, or .xlsx")
    if df.empty:
        raise ValueError("Uploaded file is empty")
    return _normalize_columns(df)


def persist_dataset(user_id: str, connection_id: str, df: pd.DataFrame) -> dict[str, Any]:
    engine = get_datasets_engine()
    schema = user_schema_name(user_id)
    table = dataset_table_name(connection_id)
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    df.to_sql(
        table,
        engine,
        schema=schema,
        if_exists="replace",
        index=False,
        method="multi",
        chunksize=500,
    )
    columns = [
        {"name": str(c), "dtype": _infer_sqlalchemy_dtype(df[c])}
        for c in df.columns
    ]
    return {
        "schema": schema,
        "table": table,
        "row_count": int(len(df)),
        "columns": columns,
    }


def drop_dataset(schema: str, table: str) -> None:
    engine = get_datasets_engine()
    with engine.begin() as conn:
        conn.execute(text(f'DROP TABLE IF EXISTS "{schema}"."{table}"'))
