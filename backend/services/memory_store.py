import json
import uuid
from pathlib import Path

_FILE = Path(__file__).parent.parent / "data" / "memory.json"


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


def as_prompt_context() -> str:
    facts = _load()
    if not facts:
        return ""
    lines = "\n".join(f"- {m['fact']}" for m in facts)
    return f"## Remembered context:\n{lines}\n\n"
