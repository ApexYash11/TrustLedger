# TrustLedger

**Enterprise AI Decision Audit & Trust Layer**

> The agent decides. TrustLedger records and verifies.

Deloitte Capstone 2026 · Team Diet Coke · Manipal University Jaipur

TrustLedger wraps around existing AI agents and captures a standardized,
tamper-evident decision record **while the decision is happening** — so
compliance and audit teams can understand, replay, and defend high-stakes
AI decisions in minutes, not days.

---

## Why it exists

AI systems make consequential decisions in seconds, but most organisations
cannot answer the questions audits actually ask: *what was decided, on what
evidence, by whom, and has anything changed since?* Reconstructing those
answers from chat logs and prompts takes days — if it can be done at all.

TrustLedger records the decision as it happens, seals it to a hash chain,
and proves it hasn't been altered.

## What it does

- **Live research pipeline** — ask a question, watch evidence stream in, get a
  recommendation sealed to the chain in seconds (4–10 s on the pinned model).
- **Command Center** — a Kanban board of every decision — queued, running,
  review-ready, completed — each with a case code, risk level and owner.
- **Every query gets a code** — a unique, collision-checked
  `RES-YYYY-######` identifier, referable forever.
- **The record** — four tabs per decision: **Summary**, **Decision Trail**,
  **Replay**, **Integrity** (hash verification).
- **Human review routing** — high-risk decisions are routed to a person
  before they're treated as final.
- **Tamper evidence** — every sealed record is SHA-256 chained; an edit after
  sealing breaks the chain and is flagged in the UI. Sealed records refuse
  edits and deletes (`409 · TASK_SEALED`).
- **Audit identity** — API-key auth per principal; every event is stamped
  with the actor that caused it and sealed with the record.
- **Reliable by design** — runs execute in background tasks with a wall-clock
  budget (`TRUSTLEDGER_RUN_BUDGET`, default 75 s); a browser navigating away
  mid-run still seals the record.

## Quick start

### 1. Environment

Copy `.env.example` to `.env` and fill in values. **Nothing in the backend
loads `.env`** — export the variables in your shell (Docker Compose picks
them up via `env_file`):

```bash
export TRUSTLEDGER_API_KEYS='compliance-analyst:<key>,claims-auditor:<key>'
export OPENROUTER_API_KEY=sk-or-...
export TRUSTLEDGER_MODEL=openai/gpt-4o-mini   # pin a model; the free router is unreliable
```

Authentication is enforced whenever `TRUSTLEDGER_API_KEYS` is set; with no
key variables configured, the API runs in open development mode. A
present-but-malformed key configuration **fails closed** at boot — it never
silently disables auth.

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000   # → http://localhost:8000/docs
```

Tables are created automatically on boot. Storage: PostgreSQL when
`DATABASE_URL` (or `POSTGRES_*`) is set, SQLite otherwise.

### 3. Seed the demo dataset

```bash
cd backend
python -m seed.load_demo_data            # 16 records; refuses if data exists
python -m seed.load_demo_data --force    # wipe and reseed
```

The seed includes the hero case `RES-2026-004821` (Tata Power, Rajasthan EV
charging) and one deliberately tampered record — `RES-2026-009999` — for
the integrity-failure demo.

### 4. Frontend

```bash
cd frontend
NEXT_PUBLIC_TRUSTLEDGER_API_KEY=<key> npm run dev   # → http://localhost:3000
```

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000/api/v1`. Both are
baked into the client bundle when the dev server starts — restart it after
changing either.

### 5. Tests

```bash
cd backend && python -m pytest tests -q    # 38 passed
```

## Architecture

```
Browser (Next.js) ── REST + SSE ──► FastAPI ──► OpenRouter (pinned model)
                                      │   ▲
                                      │   └── in-process dispatcher (0.7 s poll)
                                      ▼
                        PostgreSQL / SQLite (JSONB)
                                      │
                                      └──► SHA-256 hash chain (sealing, verify)
```

The research endpoint returns a task id immediately; the run happens in a
background worker that streams events back over SSE. The board's read path
never touches the LLM — it answers in ~20 ms.

## API (v1)

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/research/stream` | live research run (SSE) |
| `GET /api/v1/decisions` | the board |
| `GET /api/v1/decisions/{id}` | full sealed record |
| `GET /api/v1/decisions/{id}/replay` | decision trail |
| `GET /api/v1/decisions/{id}/verify` | per-record integrity check |
| `GET /api/v1/decisions/chain/verify` | whole-chain verification |
| `POST /api/v1/decisions/queue` `start` `events` `complete` | agent integration |
| `DELETE /api/v1/decisions/{id}` | unsealed records only (sealed → 409) |

All API routes except `/health` and `/docs` require
`Authorization: Bearer <key>` when auth is enabled.

## Deployment

- **Docker Compose** (`docker compose up --build`) runs Postgres + backend +
  frontend; the frontend image is a production build (`next build` +
  `next start`).
- **CORS** — deployed frontend origins are allowed by setting
  `TRUSTLEDGER_CORS_ORIGINS` (comma-separated) on the backend.
- **Keys** — generate fresh principal keys for any deployed environment;
  the browser-held key is a demo convenience, not a production pattern.

## Project structure

```
backend/
  app/                 FastAPI app (routes, services, security)
  agents/              ResearchAgent + in-process dispatcher
  seed/                16-record demo dataset + loader
  tests/               38 tests
frontend/
  src/app/             entry screen, command center, decision records
  src/components/      board, graph, timeline, replay, integrity panels
docs/                  00–14: PRD, architecture, design, roadmap
```

## Documentation

| Document | Covers |
|---|---|
| `docs/00_Project_Summary.md` | thesis, MVP, risks, priorities |
| `docs/05_Tech_Stack_and_Architecture.md` | FastAPI + OpenRouter + hash chain |
| `docs/06_Demo_Showcase_Flow.md` | 3–5 minute evaluator demo script |
| `docs/09_HLD.md` | high-level design |
| `docs/10_Current_Status.md` | implementation status |
| `docs/12_Graph_Knowledge_System.md` | evidence graph scope |

## Known limitations

- Cited sources are **asserted by the model, not retrieved** — no fetch, no
  verification that a cited document exists.
- The hash chain is **unkeyed**: tamper-evident, not tamper-proof — anyone
  with database write access could recompute the chain.
- `GET /decisions/{id}` serves the sealed snapshot **without verifying it
  first**.
- The same question can return different outcomes across runs
  (temperature 0.4).
- Authentication is API-key based; RBAC and encryption at rest are designed
  but not built.

## Team

Team Diet Coke · Manipal University Jaipur · Deloitte Capstone 2026

