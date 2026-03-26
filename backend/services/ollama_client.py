import json
from typing import AsyncGenerator

import httpx

OLLAMA_URL = "http://localhost:11434"
MODEL = "dolphin-mistral:latest"


async def stream_chat(messages: list[dict]) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/chat",
            json={"model": MODEL, "messages": messages, "stream": True},
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
            json={"model": MODEL, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        return resp.json().get("response", "")
