"""AITunnel / OpenAI-compatible web search helpers."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from typing import Any

from aerith.services.url_content_fetcher import (
    fetch_articles_from_citations,
    is_article_like_url,
    short_citation_blurb,
)

logger = logging.getLogger(__name__)

_CONTEXT_SIZES = frozenset({"low", "medium", "high"})


def build_web_search_options(context_size: str | None) -> dict[str, Any]:
    """Build web_search_options for chat.completions (empty dict is valid)."""
    size = (context_size or "high").strip().lower()
    if size not in _CONTEXT_SIZES:
        size = "high"
    return {"search_context_size": size}


def _as_dict(obj: Any) -> dict[str, Any] | None:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        try:
            return obj.model_dump()
        except Exception:
            return None
    return None


def citation_from_annotation(raw: Any) -> dict[str, Any] | None:
    """Normalize url_citation annotation to a plain dict."""
    data = _as_dict(raw)
    if not data or data.get("type") != "url_citation":
        return None
    uc = data.get("url_citation") or {}
    if not isinstance(uc, dict) and hasattr(uc, "model_dump"):
        uc = uc.model_dump()
    if not isinstance(uc, dict):
        return None
    url = (uc.get("url") or "").strip()
    if not url:
        return None
    return {
        "url": url,
        "title": (uc.get("title") or "").strip(),
        "content": (uc.get("content") or "").strip(),
        "start_index": uc.get("start_index"),
        "end_index": uc.get("end_index"),
    }


def citations_from_annotations(items: Any) -> list[dict[str, Any]]:
    if not items:
        return []
    out: list[dict[str, Any]] = []
    for raw in items:
        c = citation_from_annotation(raw)
        if c:
            out.append(c)
    return dedupe_citations(out)


def dedupe_citations(citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for c in citations:
        key = c.get("url") or ""
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def prepare_citations_for_ui(
    citations: list[dict[str, Any]],
    fetched_excerpts: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Human-friendly source list (no raw SERP tables in the UI)."""
    fetched_excerpts = fetched_excerpts or {}
    out: list[dict[str, Any]] = []
    for c in citations:
        url = c.get("url") or ""
        if url in fetched_excerpts:
            blurb = short_citation_blurb(fetched_excerpts[url], max_len=220)
            out.append({**c, "content": blurb, "article_fetched": True})
        else:
            blurb = short_citation_blurb(c.get("content") or "", max_len=160)
            out.append({
                **c,
                "content": blurb,
                "article_fetched": is_article_like_url(url) and bool(blurb),
            })
    return out


def collect_citations_from_chunk(chunk: Any) -> list[dict[str, Any]]:
    """Extract url_citation annotations from a streaming chunk, if present."""
    if not chunk or not getattr(chunk, "choices", None):
        return []
    choice = chunk.choices[0]
    found: list[dict[str, Any]] = []

    delta = getattr(choice, "delta", None)
    if delta is not None:
        found.extend(citations_from_annotations(getattr(delta, "annotations", None)))

    message = getattr(choice, "message", None)
    if message is not None:
        found.extend(citations_from_annotations(getattr(message, "annotations", None)))

    return found


WEB_SEARCH_INSTRUCTION_SUFFIX = (
    "\n- Web search is enabled. The system may fetch full HTML pages for editorial links. "
    "Synthesize findings in your own words; do not paste raw markdown tables, order books, or quote grids. "
    "Prefer news and analysis articles over exchange quote pages."
)


def stream_openai_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float,
    web_search_enabled: bool,
    web_search_context_size: str,
    web_search_deep_read: bool = True,
    cancel_flag: Any,
) -> Iterator[dict[str, Any]]:
    """
    Stream chat.completions; yields {type: delta|citations|error}.

    When deep_read is on: run web search, fetch article HTML for citation URLs,
    then stream the final answer from fetched text (not only search snippets).
    """
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    citation_acc: list[dict[str, Any]] = []
    fetched_excerpts: dict[str, str] = {}
    stream_messages = messages
    use_web_search = web_search_enabled

    try:
        if web_search_enabled and web_search_deep_read:
            probe = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                web_search_options=build_web_search_options(web_search_context_size),
            )
            probe_msg = probe.choices[0].message
            probe_citations = dedupe_citations(
                citations_from_annotations(getattr(probe_msg, "annotations", None))
            )
            citation_acc.extend(probe_citations)
            article_block, fetched_excerpts = fetch_articles_from_citations(probe_citations)

            if article_block:
                stream_messages = list(messages)
                stream_messages.append({
                    "role": "user",
                    "content": (
                        "Below is page text from web search links (HTML fetched from the sites). "
                        "Use it to answer the original question. "
                        "Do not copy quote tables or technical boilerplate.\n\n"
                        f"{article_block}"
                    ),
                })
                use_web_search = False
            else:
                logger.info("web search deep_read: no fetchable articles, search-only stream")

        kw: dict[str, Any] = {
            "model": model,
            "messages": stream_messages,
            "temperature": temperature,
            "stream": True,
        }
        if use_web_search:
            kw["web_search_options"] = build_web_search_options(web_search_context_size)

        stream = client.chat.completions.create(**kw)
        for chunk in stream:
            if getattr(cancel_flag, "is_set", lambda: False)():
                break
            citation_acc.extend(collect_citations_from_chunk(chunk))
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield {"type": "delta", "delta": delta.content}

        citations = prepare_citations_for_ui(
            dedupe_citations(citation_acc),
            fetched_excerpts,
        )
        if citations:
            yield {"type": "citations", "citations": citations}
    except Exception as exc:
        yield {"type": "error", "detail": str(exc)}


def map_subagent_events_for_ui(events: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    """Expose sub-agent tool activity as tool_call / tool_result for the chat UI."""
    for e in events:
        t = e.get("type")
        if t == "subagent_tool":
            yield {"type": "tool_call", "tool": e.get("tool") or ""}
        elif t == "subagent_result":
            yield {
                "type": "tool_result",
                "tool": e.get("tool") or "",
                "result_preview": e.get("preview") or "",
            }
