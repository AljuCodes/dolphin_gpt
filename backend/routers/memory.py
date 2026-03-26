from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import memory_store

router = APIRouter()


@router.get("/memory")
def get_memory():
    return memory_store.all_facts()


class AddReq(BaseModel):
    fact: str


@router.post("/memory")
def add_memory(body: AddReq):
    return memory_store.add(body.fact)


@router.delete("/memory/{memory_id}")
def delete_memory(memory_id: str):
    if not memory_store.remove(memory_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.delete("/memory")
def clear_memory():
    memory_store.clear()
    return {"ok": True}
