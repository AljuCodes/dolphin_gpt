from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import chat_store

router = APIRouter()


class CreateChatRequest(BaseModel):
    title: str | None = None
    messages: list[dict] | None = None


class UpdateChatRequest(BaseModel):
    title: str | None = None
    messages: list[dict] | None = None


@router.get("/chats")
def list_chats():
    return chat_store.list_chats()


@router.post("/chats")
def create_chat(req: CreateChatRequest):
    return chat_store.create_chat(title=req.title, messages=req.messages)


@router.get("/chats/{chat_id}")
def get_chat(chat_id: str):
    chat = chat_store.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="chat not found")
    return chat


@router.put("/chats/{chat_id}")
def update_chat(chat_id: str, req: UpdateChatRequest):
    chat = chat_store.update_chat(
        chat_id, messages=req.messages, title=req.title
    )
    if not chat:
        raise HTTPException(status_code=404, detail="chat not found")
    return chat


@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: str):
    ok = chat_store.delete_chat(chat_id)
    if not ok:
        raise HTTPException(status_code=404, detail="chat not found")
    return {"ok": True}
