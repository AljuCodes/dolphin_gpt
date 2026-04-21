"""Web search with page-content extraction.

Flow:
  1. `search(query)` → DuckDuckGo HTML search → list of {title, url, domain, snippet}.
  2. `enrich_with_contents(results)` → fetch the top N URLs in parallel,
     strip HTML → readable text, truncate.
  3. `as_prompt_context(results)` → numbered sources [1], [2], … with content
     and a system-prompt addendum instructing the model to cite inline.

The module is deliberately toggle-driven: `should_search` returns True whenever
the user opted in via the UI toggle (the caller already checks that); we do
not second-guess with keyword heuristics.
"""

import asyncio
import os
import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

try:
    from ddgs import DDGS
except ImportError:  # pragma: no cover
    from duckduckgo_search import DDGS


_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0 Safari/537.36"
)


def should_search(query: str) -> bool:
    """When the web-search toggle is on, search for any non-empty query.

    The caller (routers/chat.py) already gates on the per-request
    `web_search_enabled` flag and the module-level `WEB_SEARCH_ENABLED` env.
    Once we're here, the user has explicitly opted in — keyword heuristics
    only add false negatives.
    """
    if os.getenv("WEB_SEARCH_ENABLED", "1") != "1":
        return False
    return bool(query and query.strip())


def search(query: str, max_results: int = 5) -> list[dict]:
    timeout = int(os.getenv("WEB_SEARCH_TIMEOUT_SECONDS", "8"))
    try:
        with DDGS(timeout=timeout) as ddgs:
            raw = list(
                ddgs.text(
                    query,
                    max_results=max_results,
                    safesearch="off",
                )
            )
    except Exception:
        return []

    results: list[dict] = []
    seen_domains: set[str] = set()
    for item in raw:
        url = item.get("href") or item.get("url") or ""
        title = item.get("title") or "Untitled"
        snippet = item.get("body") or item.get("snippet") or ""
        if not url:
            continue
        domain = urlparse(url).netloc.replace("www.", "")
        if not domain or domain in seen_domains:
            # Prefer diverse sources; skip duplicate domains.
            continue
        seen_domains.add(domain)
        results.append(
            {
                "title": title.strip(),
                "url": url.strip(),
                "domain": domain,
                "snippet": snippet.strip(),
                "content": "",
            }
        )

    return results


def _extract_text(html: str, max_chars: int = 2500) -> str:
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")
    for tag in soup(
        ["script", "style", "nav", "header", "footer", "aside", "form",
         "noscript", "iframe", "svg", "button"]
    ):
        tag.decompose()
    # Prefer <main> or <article> if present.
    root = soup.find("main") or soup.find("article") or soup.body or soup
    text = root.get_text(separator=" ", strip=True)
    text = re.sub(r"\s+", " ", text)
    return text[:max_chars]


async def _fetch_one(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(
            url,
            follow_redirects=True,
            timeout=6.0,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        ct = resp.headers.get("content-type", "")
        if "html" not in ct.lower() or resp.status_code >= 400:
            return ""
        return _extract_text(resp.text)
    except Exception:
        return ""


async def enrich_with_contents(
    results: list[dict], top_n: int = 3
) -> list[dict]:
    """Fetch the top `top_n` pages in parallel and populate `content`."""
    if not results:
        return results
    top = results[:top_n]
    async with httpx.AsyncClient() as client:
        contents = await asyncio.gather(
            *(_fetch_one(client, r["url"]) for r in top),
            return_exceptions=False,
        )
    for r, content in zip(top, contents):
        r["content"] = content
    return results


def as_prompt_context(results: list[dict]) -> str:
    if not results:
        return ""

    blocks = []
    for i, r in enumerate(results, start=1):
        body = (r.get("content") or r.get("snippet") or "").strip()
        if not body:
            body = "(no readable content)"
        blocks.append(
            f"[{i}] {r['title']} — {r['domain']}\n"
            f"URL: {r['url']}\n"
            f"Content: {body}"
        )
    joined = "\n\n---\n\n".join(blocks)
    return (
        "## Web search results\n"
        "You have live excerpts from web pages, numbered [1], [2], … below. "
        "Use them as your primary source of truth for the user's question. "
        "Cite each factual claim inline with its source number (e.g., `[1]`) "
        "immediately after the claim. At the end, list a 'Sources' section "
        "with the numbers, titles, and URLs. "
        "If the excerpts don't contain enough to answer, say so plainly.\n\n"
        f"{joined}\n\n"
    )
