import asyncio
import json
import os
import re

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.ollama_client import stream_chat, generate
from services import memory_store
from services import web_search
from services import context_builder

router = APIRouter()

_SYSTEM = (
    "You are Dolphin, a highly capable assistant. "
    "Prioritize factual accuracy and instruction-following over creativity. "
    "When asked factual questions (name, age, preferences, prior statements), answer briefly "
    "from known user-provided context only. Do not invent biographical details or story elements. "
    "Only write long creative prose when explicitly asked for stories or roleplay."
)


class ChatRequest(BaseModel):
    messages: list[dict]


_NAME_PATTERNS = [
    re.compile(r"\bmy name is\s+([A-Za-z][A-Za-z\-']{1,31})\b", re.IGNORECASE),
    re.compile(r"\bi am\s+([A-Za-z][A-Za-z\-']{1,31})\b", re.IGNORECASE),
    re.compile(r"\bcall me\s+([A-Za-z][A-Za-z\-']{1,31})\b", re.IGNORECASE),
]

_LONGFORM_PATTERNS = [
    re.compile(r"\b(next|new)\s+chapter\b", re.IGNORECASE),
    re.compile(r"\bwrite\s+(a\s+)?(chapter|story|scene)\b", re.IGNORECASE),
    re.compile(r"\bcontinue\s+(the\s+)?(story|chapter)\b", re.IGNORECASE),
    re.compile(r"\bexpand\b", re.IGNORECASE),
]


def _latest_user_message(messages: list[dict]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return str(msg.get("content", "")).strip()
    return ""


def _is_name_query(text: str) -> bool:
    t = text.lower()
    return (
        "what is my name" in t
        or "what's my name" in t
        or "do you know my name" in t
        or "tell me my name" in t
    )


def _extract_user_name(messages: list[dict]) -> str | None:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = str(msg.get("content", ""))
        for pattern in _NAME_PATTERNS:
            match = pattern.search(content)
            if match:
                return match.group(1)
    return None


def _is_long_form_creative_request(text: str) -> bool:
    if not text:
        return False
    return any(p.search(text) for p in _LONGFORM_PATTERNS)


def _word_count(text: str) -> int:
    return len([w for w in re.split(r"\s+", text.strip()) if w])


async def _sse_stream(messages: list[dict]):
    keep_last = int(os.getenv("CHAT_MAX_MESSAGES", "12"))
    trimmed_messages = messages[-keep_last:]
    old_messages = messages[:-keep_last] if len(messages) > keep_last else []

    latest_user = _latest_user_message(messages)
    is_long_form = _is_long_form_creative_request(latest_user)

    declared_name = _extract_user_name(messages)
    if declared_name:
        memory_store.set_user_name(declared_name)

    if _is_name_query(latest_user):
        name = _extract_user_name(messages) or memory_store.get_user_name()
        if name:
            yield f"data: {json.dumps({'chunk': f'Your name is {name}.'})}\n\n"
        else:
            fallback = "I do not have your name yet. Tell me with: my name is <name>."
            yield f"data: {json.dumps({'chunk': fallback})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
        return

    max_results = int(os.getenv("WEB_SEARCH_MAX_RESULTS", "4"))
    all_facts = memory_store.all_user_facts()

    async def _web_ctx() -> str:
        if not web_search.should_search(latest_user):
            return ""
        results = await asyncio.to_thread(web_search.search, latest_user, max_results)
        return web_search.as_prompt_context(results)

    # Build all context sources in parallel: conversation summary, semantic
    # memory retrieval, and web search run concurrently to minimise latency.
    summary, semantic_ctx, web_ctx = await asyncio.gather(
        context_builder.summarize_overflow(old_messages),
        context_builder.semantic_memory_context(latest_user, all_facts),
        _web_ctx(),
    )

    system_content = _SYSTEM
    if summary:
        system_content = (
            f"## Earlier conversation summary:\n{summary}\n\n" + system_content
        )
    if semantic_ctx:
        system_content = semantic_ctx + system_content
    if web_ctx:
        system_content = web_ctx + system_content
        system_content += (
            "When web search context is provided, answer using that context directly "
            "and include source domains briefly. Do not claim you lack information "
            "unless the web context is empty."
        )
    if is_long_form:
        system_content += (
            "For creative writing requests, produce a full, developed continuation with "
            "multiple paragraphs and rich scene detail unless the user explicitly asks for brevity. "
            "Target roughly 1200-1800 words and include dialogue, action, and setting details."
        )

    full_messages = [{"role": "system", "content": system_content}] + trimmed_messages
    stream_options = None
    if is_long_form:
        stream_options = {
            "num_predict": int(os.getenv("OLLAMA_LONGFORM_NUM_PREDICT", "1800")),
            "temperature": float(os.getenv("OLLAMA_LONGFORM_TEMPERATURE", "0.8")),
            "top_p": float(os.getenv("OLLAMA_LONGFORM_TOP_P", "0.92")),
        }

    full_reply = ""

    # First pass
    part = ""
    async for chunk in stream_chat(full_messages, options_override=stream_options):
        part += chunk
        full_reply += chunk
        yield f"data: {json.dumps({'chunk': chunk})}\n\n"

    # If creative output is too short, ask the model to continue seamlessly.
    if is_long_form:
        min_words = int(os.getenv("LONGFORM_MIN_WORDS", "700"))
        max_continuations = int(os.getenv("LONGFORM_MAX_CONTINUATIONS", "4"))
        continuation_count = 0

        while _word_count(full_reply) < min_words and continuation_count < max_continuations:
            continuation_count += 1
            continuation_messages = full_messages + [
                {"role": "assistant", "content": full_reply},
                {
                    "role": "user",
                    "content": (
                        "Continue this chapter immediately from the last sentence. "
                        "Do not restart, do not summarize, do not add headings. "
                        "Keep the same tone, tense, and pacing. Write substantial additional prose."
                    ),
                },
            ]

            continuation_part = ""
            async for chunk in stream_chat(
                continuation_messages,
                options_override=stream_options,
            ):
                continuation_part += chunk
                full_reply += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            # Stop only if the model effectively returns nothing.
            if not continuation_part.strip():
                break

    yield f"data: {json.dumps({'done': True})}\n\n"

    if os.getenv("AUTO_EXTRACT_MEMORY", "1") == "1":
        asyncio.create_task(_extract_memories(trimmed_messages, full_reply))


async def _extract_memories(messages: list[dict], reply: str) -> None:
    recent = messages[-6:]
    convo = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in recent)
    convo += f"\nASSISTANT: {reply}"

    prompt = (
        "Extract 0-3 important facts from this conversation worth remembering for future context "
        "(names, story details, user preferences, world-building elements). "
        "Return ONLY a JSON array of short strings, or [] if nothing notable.\n\n"
        f"{convo}\n\nJSON array:"
    )

    try:
        raw = await generate(prompt)
        s, e = raw.find("["), raw.rfind("]") + 1
        if s >= 0 and e > s:
            for fact in json.loads(raw[s:e])[:3]:
                if isinstance(fact, str) and fact.strip():
                    memory_store.add(fact.strip())
    except Exception:
        pass


@router.post("/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        _sse_stream(req.messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
