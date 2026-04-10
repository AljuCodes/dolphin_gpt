import os
import re
from urllib.parse import urlparse

try:
    from ddgs import DDGS
except ImportError:  # pragma: no cover
    from duckduckgo_search import DDGS


_INFO_QUERY_RE = re.compile(
    r"\b(latest|today|current|news|price|weather|release|update|winner|won|result|oscar|award|"
    r"who|what|when|where|why|how)\b",
    re.IGNORECASE,
)


def should_search(query: str) -> bool:
    if os.getenv("WEB_SEARCH_ENABLED", "1") != "1":
        return False
    if os.getenv("WEB_SEARCH_ALWAYS", "0") == "1":
        return True
    q = query.strip().lower()
    if not q:
        return False
    if "?" in q:
        return True
    if re.search(r"\b(19|20)\d{2}\b", q):
        return True
    return bool(_INFO_QUERY_RE.search(q))


def search(query: str, max_results: int = 4) -> list[dict]:
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
    for item in raw:
        url = item.get("href") or item.get("url") or ""
        title = item.get("title") or "Untitled"
        snippet = item.get("body") or item.get("snippet") or ""
        if not url:
            continue
        domain = urlparse(url).netloc.replace("www.", "")
        results.append(
            {
                "title": title.strip(),
                "url": url.strip(),
                "domain": domain,
                "snippet": snippet.strip(),
            }
        )

    return results


def as_prompt_context(results: list[dict]) -> str:
    if not results:
        return ""

    lines = []
    for i, r in enumerate(results, start=1):
        lines.append(
            f"{i}. {r['title']} ({r['domain']})\nURL: {r['url']}\nSnippet: {r['snippet']}"
        )

    joined = "\n\n".join(lines)
    return (
        "## Web search context\n"
        "Use these sources to answer factual questions. Prefer concise, verifiable claims. "
        "If sources conflict, say that briefly.\n\n"
        f"{joined}\n\n"
    )
