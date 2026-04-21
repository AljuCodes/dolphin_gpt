"""LangChain-powered context building for improved conversation awareness.

Two capabilities:
1. summarize_overflow  — Summarize older conversation turns that fall outside the
                         recent message window so their context is never lost.
2. semantic_memory_context — Retrieve the most *relevant* memory facts for the
                              current user message using Ollama embeddings +
                              cosine similarity (instead of recency-only).
"""

import asyncio
import hashlib
import json
import os
from typing import Any

import numpy as np

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "hf.co/TrevorJS/gemma-4-E4B-it-uncensored-GGUF:Q4_K_M")

_embedder: Any = None
_llm: Any = None

# In-process caches (survive for the lifetime of the server process)
_summary_cache: dict[str, str] = {}
_embedding_cache: dict[str, list[float]] = {}


# ---------------------------------------------------------------------------
# Lazy singletons — initialised on first use so import stays fast
# ---------------------------------------------------------------------------

def _get_embedder():
    global _embedder
    if _embedder is None:
        from langchain_ollama import OllamaEmbeddings  # noqa: PLC0415
        _embedder = OllamaEmbeddings(base_url=OLLAMA_URL, model=MODEL)
    return _embedder


def _get_llm():
    global _llm
    if _llm is None:
        from langchain_ollama import ChatOllama  # noqa: PLC0415
        _llm = ChatOllama(
            base_url=OLLAMA_URL,
            model=MODEL,
            temperature=0.3,
            num_predict=int(os.getenv("SUMMARIZER_NUM_PREDICT", "220")),
        )
    return _llm


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    norm_a, norm_b = np.linalg.norm(va), np.linalg.norm(vb)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def _hash_messages(messages: list[dict]) -> str:
    return hashlib.md5(
        json.dumps(messages, sort_keys=True).encode()
    ).hexdigest()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def summarize_overflow(old_messages: list[dict]) -> str:
    """Return a concise summary of conversation turns outside the keep window.

    Results are cached by message-content hash so repeated requests for the
    same history incur no extra LLM call.
    """
    if not old_messages:
        return ""

    cache_key = _hash_messages(old_messages)
    if cache_key in _summary_cache:
        return _summary_cache[cache_key]

    convo = "\n".join(
        f"{m['role'].upper()}: {str(m['content'])[:400]}" for m in old_messages
    )
    prompt = (
        "Summarize the following conversation excerpt in 4-6 sentences. "
        "Preserve key facts, user preferences, names, decisions, and any important context "
        "a future reader would need:\n\n"
        f"{convo}\n\nSummary:"
    )

    try:
        from langchain_core.messages import HumanMessage  # noqa: PLC0415
        llm = _get_llm()
        response = await asyncio.to_thread(
            lambda: llm.invoke([HumanMessage(content=prompt)])
        )
        summary = response.content.strip()
    except Exception:
        # Graceful fallback: surface the last few old turns verbatim
        fallback = old_messages[-3:]
        summary = " | ".join(
            f"{m['role']}: {str(m['content'])[:120]}" for m in fallback
        )

    _summary_cache[cache_key] = summary
    return summary


async def semantic_memory_context(
    query: str,
    facts: list[dict],
    k: int = 6,
) -> str:
    """Retrieve the *k* most semantically relevant facts for *query*.

    Falls back to the last *k* facts if embeddings are unavailable.
    """
    if not facts:
        return ""

    try:
        embedder = _get_embedder()

        # Only embed facts that aren't already cached
        new_texts = [f["fact"] for f in facts if f["fact"] not in _embedding_cache]
        if new_texts:
            new_embs: list[list[float]] = await asyncio.to_thread(
                embedder.embed_documents, new_texts
            )
            for text, emb in zip(new_texts, new_embs):
                _embedding_cache[text] = emb

        query_emb: list[float] = await asyncio.to_thread(
            embedder.embed_query, query
        )

        scored: list[tuple[float, str]] = []
        for fact_dict in facts:
            emb = _embedding_cache.get(fact_dict["fact"])
            if emb is not None:
                sim = _cosine_similarity(query_emb, emb)
                scored.append((sim, fact_dict["fact"]))

        scored.sort(key=lambda x: x[0], reverse=True)
        top_facts = [fact for _, fact in scored[:k]]

    except Exception:
        # Fallback to most-recent k facts
        top_facts = [f["fact"] for f in facts[-k:]]

    if not top_facts:
        return ""

    lines = "\n".join(f"- {f}" for f in top_facts)
    return f"## Remembered context:\n{lines}\n\n"
