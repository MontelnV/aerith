from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAILike
from agno.run.agent import (
    IntermediateRunContentEvent,
    RunContentEvent,
    RunOutput,
    ToolCallCompletedEvent,
    ToolCallStartedEvent,
)

from aerith.config import get_settings
from aerith.db.models import DatasetConnection
from aerith.db.session import app_session
from aerith.instruments.analytics_tools import build_analytics_tools
from aerith.services.guardrails import with_guardrails
from aerith.services.web_search import (
    WEB_SEARCH_INSTRUCTION_SUFFIX,
    map_subagent_events_for_ui,
    stream_openai_completion,
)

logger = logging.getLogger(__name__)


SUB_INSTRUCTIONS = """You are a data analyst working on ONE data source.
- Use list_tables / describe_table / sample_rows / run_select_query to inspect data.
- Use ONLY read-only SELECT / WITH queries.
- Produce a concise markdown summary of what you found: key metrics, notable values, any caveats.
- Keep it factual; do not speculate beyond the data you have.
- End with a short "KEY FACTS" bullet list."""

LEAD_MERGE_INSTRUCTIONS = """You are the lead analyst. You received findings from multiple data sources.
- Integrate them into a single clear final answer for the user in the same language as the question.
- Point out cross-source comparisons or contradictions if any.
- If charts were requested and data allows, include chart blocks (see format below)."""

TABLE_SUFFIX = """
- When showing tabular data, use EXACTLY this fenced block (valid JSON only):
```table
{"title":"Optional","columns":[{"key":"k","label":"K"}],"rows":[{"k":1}]}
```
"""
CHART_SUFFIX = """
- You may include chart blocks using EXACTLY this fenced block (valid JSON only, one object per block):
```chart
{"kind":"bar","title":"Title","xKey":"label","series":["value"],"data":[{"label":"A","value":10}]}
```
- Supported kind values:
  - bar — compare categories; xKey = label field; series = numeric column names (one or more).
  - line / area — time series; xKey = date or period; series = metric column names.
  - pie — shares or composition; xKey = segment name; series = ["value"] with a single numeric column.
  - scatter — relationship between two metrics; xKey = x column; series = ["y"] for the y column.
  - candlestick — OHLC price history; xKey = date; each row must have open, high, low, close (volume optional). Do not set series for candlestick.
- Examples:
```chart
{"kind":"pie","title":"Allocation","xKey":"name","series":["amount"],"data":[{"name":"Equities","amount":60},{"name":"Bonds","amount":40}]}
```
```chart
{"kind":"scatter","title":"P/E vs growth","xKey":"pe","series":["growth"],"data":[{"pe":8.2,"growth":12.5},{"pe":11,"growth":6.1}]}
```
```chart
{"kind":"candlestick","title":"SBER","xKey":"date","data":[{"date":"2026-04-01","open":320,"high":325,"low":318,"close":323}]}
```
- Use a chart when it clarifies the answer: candlestick for quotes/OHLC, pie for allocation, scatter for correlation, bar/line/area for trends and comparisons.
"""
SUGGESTIONS_SUFFIX = """
- End with EXACTLY one fenced block with 2–5 follow-up questions in the user's language:
```suggestions
["...", "..."]
```
"""


def _dataset_records(dataset_ids: list[str]) -> list[dict[str, Any]]:
    with app_session() as s:
        out: list[dict[str, Any]] = []
        for ds_id in dataset_ids:
            d = s.get(DatasetConnection, ds_id)
            if d is None:
                continue
            out.append({
                "id": d.id,
                "name": d.name,
                "description": d.description,
                "kind": d.kind,
                "host": d.host,
                "port": d.port,
                "database_name": d.database_name,
                "username": d.username,
                "password_encrypted": d.password_encrypted,
                "ssl_mode": d.ssl_mode,
                "uploaded_schema": d.uploaded_schema,
                "uploaded_table": d.uploaded_table,
                "uploaded_columns": d.uploaded_columns,
                "uploaded_row_count": d.uploaded_row_count,
            })
        return out


def _build_agent(
    *,
    tools: list[Any],
    instructions: str,
    model_id: str,
    api_key: str,
    base_url: str,
    temperature: float,
    tool_call_limit: int = 16,
) -> Agent:
    model = OpenAILike(
        id=model_id,
        api_key=api_key,
        base_url=base_url,
        temperature=temperature,
        role_map={
            "system": "system",
            "user": "user",
            "assistant": "assistant",
            "tool": "tool",
            "model": "assistant",
        },
    )
    return Agent(
        model=model,
        tools=tools,
        instructions=instructions,
        markdown=True,
        tool_call_limit=tool_call_limit,
    )


def _history_block(messages: list[dict[str, Any]], max_turns: int = 10) -> str:
    lines: list[str] = []
    for m in messages[-max_turns * 2 :]:
        role = str(m.get("role", ""))
        if role not in ("user", "assistant"):
            continue
        content = str(m.get("content", "")).strip()
        if not content:
            continue
        lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines) if lines else "(no prior messages)"


def _plan_subtasks(
    *,
    sources: list[dict[str, Any]],
    user_message: str,
    history: str,
    model_id: str,
    api_key: str,
    base_url: str,
) -> list[dict[str, str]]:
    """Ask the planner for a JSON list of {source_id, question}."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    src_desc = "\n".join(
        f"- id={s['id']} name={s['name']} kind={s['kind']}"
        + (f" schema={s.get('uploaded_schema')}" if s.get("uploaded_schema") else "")
        + (f" description={s.get('description')}" if s.get("description") else "")
        for s in sources
    )
    system = with_guardrails(
        "You plan a data analysis across multiple sources. "
        "For each relevant source, produce a focused sub-question answerable from THAT source alone. "
        "Return ONLY a JSON object of shape "
        '{"subtasks":[{"source_id":"...","question":"..."}]} '
        "and nothing else."
    )
    user = f"Available sources:\n{src_desc}\n\nConversation:\n{history}\n\nUser question: {user_message}"
    try:
        resp = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.1,
        )
        text = resp.choices[0].message.content or "{}"
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("` \n")
            if text.lower().startswith("json"):
                text = text[4:].strip()
        obj = json.loads(text)
        out: list[dict[str, str]] = []
        for t in obj.get("subtasks", []):
            sid = str(t.get("source_id") or "").strip()
            q = str(t.get("question") or "").strip()
            if sid and q:
                out.append({"source_id": sid, "question": q})
        if out:
            return out
    except Exception:
        logger.exception("planning failed; fallback to one sub-agent per source")
    return [{"source_id": s["id"], "question": user_message} for s in sources]


def _run_subagent_stream(
    *,
    source: dict[str, Any],
    question: str,
    model_id: str,
    api_key: str,
    base_url: str,
    temperature: float,
    max_steps: int,
    cancel_flag: Any,
) -> tuple[str, list[dict[str, Any]]]:
    """Run a sub-agent; return (final_summary_text, events)."""
    tools = build_analytics_tools(source)
    agent = _build_agent(
        tools=tools,
        instructions=with_guardrails(SUB_INSTRUCTIONS),
        model_id=model_id,
        api_key=api_key,
        base_url=base_url,
        temperature=temperature,
        tool_call_limit=max_steps,
    )
    prompt = (
        f"Source: {source.get('name')} (id={source.get('id')})\n"
        f"Task: {question}\n\n"
        "Inspect the source and return a concise markdown summary."
    )
    events: list[dict[str, Any]] = []
    final_parts: list[str] = []
    try:
        stream = agent.run(prompt, stream=True, stream_events=True)
        for chunk in stream:
            if getattr(cancel_flag, "is_set", lambda: False)():
                break
            if isinstance(chunk, ToolCallStartedEvent):
                t = chunk.tool
                name = t.tool_name if t else ""
                events.append({"type": "subagent_tool", "source_id": source["id"], "tool": name})
            elif isinstance(chunk, ToolCallCompletedEvent):
                t = chunk.tool
                name = t.tool_name if t else ""
                res = str(t.result) if t and t.result is not None else ""
                preview = res[:800] + ("…" if len(res) > 800 else "")
                events.append({"type": "subagent_result", "source_id": source["id"], "tool": name, "preview": preview})
            elif isinstance(chunk, (RunContentEvent, IntermediateRunContentEvent)):
                c = getattr(chunk, "content", None)
                if c:
                    final_parts.append(str(c))
            elif isinstance(chunk, RunOutput):
                text = chunk.get_content_as_string() if hasattr(chunk, "get_content_as_string") else ""
                if text:
                    final_parts.append(text)
    except Exception as exc:
        events.append({"type": "subagent_error", "source_id": source["id"], "detail": str(exc)})
        return "", events
    return "".join(final_parts), events


def stream_analytics_swarm(
    *,
    dataset_ids: list[str],
    messages: list[dict[str, Any]],
    user_message: str,
    model_id: str,
    api_key: str,
    base_url: str,
    temperature: float,
    charts_enabled: bool,
    web_search_enabled: bool = False,
    web_search_context_size: str = "high",
    web_search_deep_read: bool = True,
    cancel_flag: Any,
) -> Iterator[dict[str, Any]]:
    """Generator of events; runs in a worker thread (called via run_in_executor)."""
    settings = get_settings()
    cfg = settings.analytics
    sources = _dataset_records(dataset_ids)
    if not sources:
        yield {"type": "error", "detail": "No datasets available for this chat."}
        return

    history = _history_block(messages)
    lead_model = cfg.lead_model or model_id
    planner_model = cfg.planner_model or model_id

    if len(sources) == 1:
        source = sources[0]
        if web_search_enabled:
            summary, evs = _run_subagent_stream(
                source=source,
                question=user_message,
                model_id=model_id,
                api_key=api_key,
                base_url=base_url,
                temperature=temperature,
                max_steps=cfg.subagent_max_steps,
                cancel_flag=cancel_flag,
            )
            yield from map_subagent_events_for_ui(evs)
            yield {"type": "merge_start"}
            lead_instructions = with_guardrails(
                LEAD_MERGE_INSTRUCTIONS
                + WEB_SEARCH_INSTRUCTION_SUFFIX
                + TABLE_SUFFIX
                + (CHART_SUFFIX if charts_enabled else "")
                + SUGGESTIONS_SUFFIX
            )
            lead_prompt = (
                f"Conversation so far:\n{history}\n\n"
                f"User question:\n{user_message}\n\n"
                f"Findings from data source «{source.get('name')}»:\n{summary or '(no summary)'}\n\n"
                "Produce a unified final answer for the user."
            )
            yield from stream_openai_completion(
                api_key=api_key,
                base_url=base_url,
                model=lead_model,
                messages=[
                    {"role": "system", "content": lead_instructions},
                    {"role": "user", "content": lead_prompt},
                ],
                temperature=temperature,
                web_search_enabled=True,
                web_search_context_size=web_search_context_size,
                web_search_deep_read=web_search_deep_read,
                cancel_flag=cancel_flag,
            )
            return

        instructions = with_guardrails(
            SUB_INSTRUCTIONS + TABLE_SUFFIX + (CHART_SUFFIX if charts_enabled else "") + SUGGESTIONS_SUFFIX
        )
        tools = build_analytics_tools(source)
        agent = _build_agent(
            tools=tools,
            instructions=instructions,
            model_id=model_id,
            api_key=api_key,
            base_url=base_url,
            temperature=temperature,
            tool_call_limit=cfg.subagent_max_steps,
        )
        prompt = (
            f"Conversation so far:\n{history}\n\n"
            f"Latest user question:\n{user_message}\n\n"
            "Answer using tools as needed, then give a clear final answer."
        )
        try:
            stream = agent.run(prompt, stream=True, stream_events=True)
            for chunk in stream:
                if getattr(cancel_flag, "is_set", lambda: False)():
                    break
                if isinstance(chunk, ToolCallStartedEvent):
                    t = chunk.tool
                    yield {"type": "tool_call", "tool": t.tool_name if t else ""}
                elif isinstance(chunk, ToolCallCompletedEvent):
                    t = chunk.tool
                    name = t.tool_name if t else ""
                    res = str(t.result) if t and t.result is not None else ""
                    preview = res[:1200] + ("…" if len(res) > 1200 else "")
                    yield {"type": "tool_result", "tool": name, "result_preview": preview}
                elif isinstance(chunk, (RunContentEvent, IntermediateRunContentEvent)):
                    c = getattr(chunk, "content", None)
                    if c:
                        yield {"type": "delta", "delta": str(c)}
                elif isinstance(chunk, RunOutput):
                    text = chunk.get_content_as_string() if hasattr(chunk, "get_content_as_string") else ""
                    if text:
                        yield {"type": "delta", "delta": text}
        except Exception as exc:
            yield {"type": "error", "detail": str(exc)}
        return

    subtasks = _plan_subtasks(
        sources=sources,
        user_message=user_message,
        history=history,
        model_id=planner_model,
        api_key=api_key,
        base_url=base_url,
    )
    yield {"type": "plan", "subtasks": subtasks}

    src_by_id = {s["id"]: s for s in sources}
    for t in subtasks:
        src = src_by_id.get(t["source_id"])
        if src is None:
            continue
        yield {"type": "subagent_start", "source_id": src["id"], "name": src.get("name") or src["id"]}

    results: dict[str, dict[str, Any]] = {}

    with ThreadPoolExecutor(max_workers=max(1, min(len(subtasks), 6))) as ex:
        futures: dict[Future, dict[str, str]] = {}
        for t in subtasks:
            src = src_by_id.get(t["source_id"])
            if src is None:
                continue
            fut = ex.submit(
                _run_subagent_stream,
                source=src,
                question=t["question"],
                model_id=model_id,
                api_key=api_key,
                base_url=base_url,
                temperature=temperature,
                max_steps=cfg.subagent_max_steps,
                cancel_flag=cancel_flag,
            )
            futures[fut] = t

        for fut in list(futures.keys()):
            t = futures[fut]
            try:
                summary, evs = fut.result(timeout=cfg.subagent_timeout_sec)
                for e in evs:
                    yield e
                results[t["source_id"]] = {"summary": summary, "question": t["question"]}
                yield {
                    "type": "subagent_done",
                    "source_id": t["source_id"],
                    "summary_preview": (summary[:400] + ("…" if len(summary) > 400 else "")),
                }
            except Exception as exc:
                results[t["source_id"]] = {"summary": "", "error": str(exc), "question": t["question"]}
                yield {"type": "subagent_done", "source_id": t["source_id"], "error": str(exc)}

    if getattr(cancel_flag, "is_set", lambda: False)():
        yield {"type": "error", "detail": "Cancelled"}
        return

    yield {"type": "merge_start"}

    merge_parts = []
    for sid, res in results.items():
        src = src_by_id.get(sid)
        nm = src.get("name") if src else sid
        if res.get("error"):
            merge_parts.append(f"## Source: {nm}\n(sub-agent failed: {res['error']})\n")
        else:
            merge_parts.append(f"## Source: {nm}\nSub-question: {res.get('question', '')}\n\n{res.get('summary', '')}\n")
    merge_body = "\n\n".join(merge_parts)

    lead_instructions = with_guardrails(
        LEAD_MERGE_INSTRUCTIONS
        + TABLE_SUFFIX
        + (CHART_SUFFIX if charts_enabled else "")
        + SUGGESTIONS_SUFFIX
        + (WEB_SEARCH_INSTRUCTION_SUFFIX if web_search_enabled else "")
    )
    lead_prompt = (
        f"Conversation so far:\n{history}\n\n"
        f"Original user question:\n{user_message}\n\n"
        f"Findings from sub-agents:\n{merge_body}\n\n"
        "Produce a unified final answer now."
    )
    yield from stream_openai_completion(
        api_key=api_key,
        base_url=base_url,
        model=lead_model,
        messages=[
            {"role": "system", "content": lead_instructions},
            {"role": "user", "content": lead_prompt},
        ],
        temperature=temperature,
        web_search_enabled=web_search_enabled,
        web_search_context_size=web_search_context_size,
        web_search_deep_read=web_search_deep_read,
        cancel_flag=cancel_flag,
    )
