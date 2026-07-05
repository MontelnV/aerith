"""Agno tools bound to a single dataset connection (one per sub-agent)."""

from __future__ import annotations

from typing import Any

from agno.tools import tool

from aerith.instruments import analytics_db as adb


def build_analytics_tools(connection_rec: dict[str, Any]) -> list[Any]:
    rec = connection_rec
    source_name = str(rec.get("name") or rec.get("id") or "source")

    @tool(
        name="list_tables",
        description=f"List tables available in dataset '{source_name}'.",
    )
    def list_tables_tool(schema: str | None = None) -> str:
        return adb.json_dumps_safe(adb.list_tables(rec, schema))

    @tool(
        name="describe_table",
        description="Show columns for a table (schema + table name).",
    )
    def describe_table_tool(schema: str, table: str) -> str:
        return adb.json_dumps_safe(adb.describe_table(rec, schema, table))

    @tool(
        name="sample_rows",
        description="Return up to N sample rows from a table (read-only).",
    )
    def sample_rows_tool(schema: str, table: str, limit: int = 20) -> str:
        return adb.json_dumps_safe(adb.sample_rows(rec, schema, table, limit))

    @tool(
        name="run_select_query",
        description=f"Run a single SELECT / WITH query on dataset '{source_name}' (read-only).",
    )
    def run_select_query_tool(sql: str) -> str:
        rows = adb.run_select_query(rec, sql)
        return adb.json_dumps_safe(rows)

    return [
        list_tables_tool,
        describe_table_tool,
        sample_rows_tool,
        run_select_query_tool,
    ]
