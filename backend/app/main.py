import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, SessionLocal, engine
from .routes import agents, decisions, research
from .security import auth_middleware, validate_auth_config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail closed: a malformed auth configuration must refuse to boot rather
    # than run with authentication silently off (review finding P1).
    validate_auth_config()
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

# API-key auth first (inner), CORS second (outer). CORS outermost means
# preflight OPTIONS are answered before auth runs AND auth's own 401/403
# responses pass back through CORS carrying Access-Control-Allow-Origin, so the
# browser surfaces the real auth error instead of a generic network failure
# (review finding P2).
app.middleware("http")(auth_middleware)

# CORS origins: local dev defaults plus any origins listed in
# TRUSTLEDGER_CORS_ORIGINS (comma-separated) — the deployed frontend origin.
cors_env = os.environ.get("TRUSTLEDGER_CORS_ORIGINS", "")
extra_origins = [o.strip() for o in cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", *extra_origins],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(agents.router, prefix="/api/v1")
app.include_router(decisions.router, prefix="/api/v1")
app.include_router(research.router, prefix="/api/v1")
