import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, SessionLocal, engine
from .routes import agents, decisions, research
from .security import auth_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    dispatcher_task = None
    # Run the agent dispatcher in-process unless explicitly disabled (tests).
    if os.environ.get("TRUSTLEDGER_DISPATCHER", "1") != "0":
        from agents.runtime import dispatcher_loop

        dispatcher_task = asyncio.create_task(dispatcher_loop(SessionLocal, poll_seconds=float(os.environ.get("TRUSTLEDGER_POLL", "0.7"))))

    yield

    if dispatcher_task is not None:
        dispatcher_task.cancel()
        try:
            await dispatcher_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="TrustLedger API",
    version="0.1.0",
    description="Enterprise AI decision audit & trust layer — logging API, replay, integrity verification.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API-key auth: registered after CORS so preflight OPTIONS passes through first.
# Enforcement is active only when TRUSTLEDGER_API_KEYS / TRUSTLEDGER_API_KEY is
# configured (see app/security.py) — dev and tests stay open by default.
app.middleware("http")(auth_middleware)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(agents.router, prefix="/api/v1")
app.include_router(decisions.router, prefix="/api/v1")
app.include_router(research.router, prefix="/api/v1")
