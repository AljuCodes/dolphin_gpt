import json
import uuid
from pathlib import Path

_FILE = Path(__file__).parent.parent / "data" / "memory.json"
_NAME_PREFIX = "__profile_name__:"


def _load() -> list[dict]:
    _FILE.parent.mkdir(exist_ok=True)
    if not _FILE.exists():
        return []
    return json.loads(_FILE.read_text())


def _save(data: list[dict]) -> None:
    _FILE.parent.mkdir(exist_ok=True)
    _FILE.write_text(json.dumps(data, indent=2))


def all_facts() -> list[dict]:
    return _load()


def add(fact: str) -> dict:
    data = _load()
    entry = {"id": str(uuid.uuid4()), "fact": fact}
    data.append(entry)
    _save(data)
    return entry


def remove(memory_id: str) -> bool:
    data = _load()
    filtered = [m for m in data if m["id"] != memory_id]
    if len(filtered) == len(data):
        return False
    _save(filtered)
    return True


def clear() -> None:
    _save([])


def set_user_name(name: str) -> None:
    data = _load()
    data = [m for m in data if not str(m.get("fact", "")).startswith(_NAME_PREFIX)]
    data.append({"id": str(uuid.uuid4()), "fact": f"{_NAME_PREFIX}{name.strip()}"})
    _save(data)


def get_user_name() -> str | None:
    data = _load()
    for item in reversed(data):
        fact = str(item.get("fact", ""))
        if fact.startswith(_NAME_PREFIX):
            name = fact[len(_NAME_PREFIX):].strip()
            return name or None
    return None


def all_user_facts() -> list[dict]:
    """Return all non-profile facts, suitable for semantic search."""
    return [
        m for m in _load()
        if not str(m.get("fact", "")).startswith(_NAME_PREFIX)
    ]


def as_prompt_context(max_items: int = 12, max_chars: int = 900) -> str:
    facts = [
        m
        for m in _load()
        if not str(m.get("fact", "")).startswith(_NAME_PREFIX)
    ][-max_items:]
    if not facts:
        return ""
    lines = "\n".join(f"- {m['fact']}" for m in facts)
    if len(lines) > max_chars:
        lines = lines[-max_chars:]
    return f"## Remembered context:\n{lines}\n\n"
