from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import asyncio

from routers import chat, memory as memory_router
from services.ollama_client import prewarm_model

load_dotenv()

app = FastAPI(title="dolphin_gpt", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(memory_router.router, prefix="/api")


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
