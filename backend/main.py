from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from routers import chat, memory as memory_router

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


@app.get("/")
def root():
    return {"status": "ok"}
