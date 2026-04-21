"""Persistent store for named chat sessions.

Layout (single JSON file, atomic rewrite on every mutation):

    {
      "chats": {
        "<id>": {
          "id": "<id>",
          "title": "Short title",
          "messages": [{"role": "user"|"assistant", "content": "..."}],
          "created_at": 1700000000.0,
          "updated_at": 1700000000.0
        },
        ...
      }
    }
"""

import json
import os
import time
import uuid
from pathlib import Path
from threading import Lock
from typing import Any

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_DATA_DIR.mkdir(exist_ok=True)
_PATH = _DATA_DIR / "chats.json"
_LOCK = Lock()


def _load() -> dict[str, Any]:
    if not _PATH.exists():
        return {"chats": {}}
    try:
        return json.loads(_PATH.read_text())
    except Exception:
        return {"chats": {}}


def _save(data: dict[str, Any]) -> None:
    tmp = _PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, _PATH)


def _derive_title(messages: list[dict]) -> str:
    for m in messages:
        if m.get("role") == "user" and m.get("content"):
            text = str(m["content"]).strip().replace("\n", " ")
            return text[:60] + ("…" if len(text) > 60 else "")
    return "New chat"


def list_chats() -> list[dict]:
    with _LOCK:
        data = _load()
    items = list(data["chats"].values())
    items.sort(key=lambda c: c.get("updated_at", 0), reverse=True)
    return [
        {
            "id": c["id"],
            "title": c.get("title") or "Untitled",
            "created_at": c.get("created_at", 0),
            "updated_at": c.get("updated_at", 0),
            "message_count": len(c.get("messages", [])),
        }
        for c in items
    ]


def get_chat(chat_id: str) -> dict | None:
    with _LOCK:
        data = _load()
    return data["chats"].get(chat_id)


def create_chat(title: str | None = None, messages: list[dict] | None = None) -> dict:
    now = time.time()
    chat = {
        "id": uuid.uuid4().hex[:12],
        "title": title or _derive_title(messages or []),
        "messages": messages or [],
        "created_at": now,
        "updated_at": now,
    }
    with _LOCK:
        data = _load()
        data["chats"][chat["id"]] = chat
        _save(data)
    return chat


def update_chat(
    chat_id: str,
    messages: list[dict] | None = None,
    title: str | None = None,
) -> dict | None:
    with _LOCK:
        data = _load()
        chat = data["chats"].get(chat_id)
        if not chat:
            return None
        if messages is not None:
            chat["messages"] = messages
            if not chat.get("title") or chat["title"] == "New chat":
                chat["title"] = _derive_title(messages)
        if title is not None:
            chat["title"] = title.strip() or chat["title"]
        chat["updated_at"] = time.time()
        data["chats"][chat_id] = chat
        _save(data)
    return chat


def delete_chat(chat_id: str) -> bool:
    with _LOCK:
        data = _load()
        if chat_id not in data["chats"]:
            return False
        del data["chats"][chat_id]
        _save(data)
    return True
