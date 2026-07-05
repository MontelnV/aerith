from __future__ import annotations

from collections.abc import Iterator
import logging
from typing import Any, Literal, TypedDict

from openai import OpenAI

from aerith.services.web_search import stream_openai_completion

logger = logging.getLogger(__name__)


def _safe_base_url(value: str) -> str:
    return value.strip().rstrip("/")


class StreamEvent(TypedDict, total=False):
    type: Literal["content", "annotations"]
    content: str
    annotations: list[dict[str, Any]]


class AIService:
    def __init__(self, api_key: str, base_url: str, model: str):
        if not api_key:
            raise RuntimeError(
                "No LLM provider configured. Add a provider in Settings "
                "or set LLM__API_KEY in .env"
            )
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.base_url = _safe_base_url(base_url)

    def reply_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.1,
        *,
        model: str | None = None,
        web_search_enabled: bool = False,
        web_search_context_size: str = "high",
        web_search_deep_read: bool = True,
        cancel_flag: Any = None,
    ) -> Iterator[StreamEvent]:
        m = (model or "").strip() or self.model
        logger.info(
            "LLM request start mode=stream model=%s web_search=%s deep_read=%s",
            m,
            web_search_enabled,
            web_search_deep_read,
        )
        if cancel_flag is None:
            cancel_flag = type("_Flag", (), {"is_set": lambda: False})()

        for ev in stream_openai_completion(
            api_key=self.client.api_key,
            base_url=self.base_url,
            model=m,
            messages=messages,
            temperature=temperature,
            web_search_enabled=web_search_enabled,
            web_search_context_size=web_search_context_size,
            web_search_deep_read=web_search_deep_read,
            cancel_flag=cancel_flag,
        ):
            if ev.get("type") == "delta":
                yield {"type": "content", "content": ev.get("delta") or ""}
            elif ev.get("type") == "citations":
                yield {"type": "annotations", "annotations": ev.get("citations") or []}
            elif ev.get("type") == "error":
                raise RuntimeError(str(ev.get("detail") or "Model failed"))
