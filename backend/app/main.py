from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from .routes import agents, decisions

app = FastAPI(
    title="TrustLedger API",
    version="0.1.0",
    description="Enterprise AI decision audit & trust layer — logging API, replay, integrity verification.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(agents.router, prefix="/api/v1")
app.include_router(decisions.router, prefix="/api/v1")
