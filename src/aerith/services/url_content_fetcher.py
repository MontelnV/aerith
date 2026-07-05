"""Fetch and extract readable text from article URLs (web search follow-up)."""

from __future__ import annotations

import logging
import re
from html import unescape
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_SKIP_URL_PARTS = (
    "finmarket.ru",
    "e-disclosure.ru",
    "google.com/search",
    "yandex.ru/search",
)

_USER_AGENT = (
    "Mozilla/5.0 (compatible; AerithBot/1.0; +https://github.com/aerith)"
)


def is_article_like_url(url: str) -> bool:
    u = (url or "").lower()
    if not u.startswith(("http://", "https://")):
        return False
    for part in _SKIP_URL_PARTS:
        if part in u:
            return False
    return True


def _strip_html(html: str) -> str:
    html = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    html = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", html)
    html = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", html)
    text = re.sub(r"<[^>]+>", " ", html)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_page_text(url: str, *, max_chars: int = 12_000, timeout: float = 12.0) -> str:
    """Download HTML and return plain text (best-effort)."""
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=timeout,
            headers={"User-Agent": _USER_AGENT, "Accept-Language": "ru-RU,ru;q=0.9"},
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            ctype = (resp.headers.get("content-type") or "").lower()
            if "html" not in ctype and "text" not in ctype:
                return ""
            raw = resp.text
    except Exception as exc:
        logger.debug("fetch_page_text failed url=%s: %s", url, exc)
        return ""

    text = _strip_html(raw)
    if len(text) < 200:
        return ""
    return text[:max_chars]


def fetch_articles_from_citations(
    citations: list[dict],
    *,
    max_pages: int = 3,
    max_chars_per_page: int = 10_000,
) -> tuple[str, dict[str, str]]:
    """
    Fetch article-like URLs from citations.

    Returns:
        (block for LLM prompt, map url -> excerpt for UI)
    """
    blocks: list[str] = []
    excerpts: dict[str, str] = {}
    seen: set[str] = set()

    for c in citations:
        url = (c.get("url") or "").strip()
        if not url or url in seen or not is_article_like_url(url):
            continue
        seen.add(url)
        text = fetch_page_text(url, max_chars=max_chars_per_page)
        if not text:
            continue
        title = (c.get("title") or "").strip() or urlparse(url).netloc
        blocks.append(f"### {title}\nURL: {url}\n\n{text}")
        excerpts[url] = text[:400] + ("…" if len(text) > 400 else "")
        if len(blocks) >= max_pages:
            break

    if not blocks:
        return "", excerpts
    return "\n\n---\n\n".join(blocks), excerpts


def short_citation_blurb(raw: str, *, max_len: int = 180) -> str:
    """Short UI excerpt; drops markdown tables and noise."""
    if not raw:
        return ""
    parts: list[str] = []
    for line in raw.replace("\r", "\n").split("\n"):
        s = line.strip()
        if not s or s.startswith("|") or s == "---":
            continue
        if re.match(r"^[\|\-\s]+$", s):
            continue
        parts.append(s)
    text = " ".join(parts)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text
    cut = text[:max_len].rsplit(" ", 1)[0]
    return (cut or text[:max_len]) + "…"
