import json
import os
from typing import AsyncGenerator

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "dolphin-mistral:latest")
OLLAMA_OPTIONS = {
    "num_ctx": int(os.getenv("OLLAMA_NUM_CTX", "4096")),
    "temperature": float(os.getenv("OLLAMA_TEMPERATURE", "0.6")),
    "top_p": float(os.getenv("OLLAMA_TOP_P", "0.9")),
    "num_predict": int(os.getenv("OLLAMA_NUM_PREDICT", "384")),
    "num_batch": int(os.getenv("OLLAMA_NUM_BATCH", "256")),
    "num_thread": int(os.getenv("OLLAMA_NUM_THREAD", str(os.cpu_count() or 8))),
}


async def stream_chat(
    messages: list[dict],
    options_override: dict | None = None,
) -> AsyncGenerator[str, None]:
    options = OLLAMA_OPTIONS if not options_override else {**OLLAMA_OPTIONS, **options_override}
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": MODEL,
                "messages": messages,
                "stream": True,
                "options": options,
                "keep_alive": os.getenv("OLLAMA_KEEP_ALIVE", "30m"),
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                chunk = data.get("message", {}).get("content", "")
                if chunk:
                    yield chunk
                if data.get("done"):
                    return


async def generate(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": OLLAMA_OPTIONS,
                "keep_alive": os.getenv("OLLAMA_KEEP_ALIVE", "30m"),
            },
        )
        resp.raise_for_status()
        return resp.json().get("response", "")


async def prewarm_model() -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL,
                "prompt": "ready",
                "stream": False,
                "options": {**OLLAMA_OPTIONS, "num_predict": 1},
                "keep_alive": os.getenv("OLLAMA_KEEP_ALIVE", "30m"),
            },
        )
        resp.raise_for_status()
