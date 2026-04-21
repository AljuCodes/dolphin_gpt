from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import asyncio

from routers import chat, memory as memory_router, chats as chats_router
from services.ollama_client import prewarm_model

app = FastAPI(title="dolphin_gpt", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(memory_router.router, prefix="/api")
app.include_router(chats_router.router, prefix="/api")


@app.on_event("startup")
async def startup_event() -> None:
    if os.getenv("OLLAMA_PREWARM", "1") == "1":
        asyncio.create_task(_safe_prewarm())


async def _safe_prewarm() -> None:
    try:
        await prewarm_model()
    except Exception:
        pass


@app.get("/")
def root():
    return {"status": "ok"}
