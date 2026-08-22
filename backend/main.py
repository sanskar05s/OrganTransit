import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from poller import poller_loop
from ai import router as ai_router
from control import router as control_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(poller_loop())
    yield
    task.cancel()


app = FastAPI(title="Organ Transport Monitor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(ai_router)
app.include_router(control_router)


@app.get("/health")
async def health():
    return {"status": "healthy"}
