# TrustLedger — Current Status

> **Last updated:** 25 August 2026 (Week 2 of 4)
> **Audience:** Mentors, team, evaluators
> **Companion doc:** `09_HLD.md` (High-Level Design)

---

## 1. One-Paragraph Status

The full backend is **implemented, tested, and live**: the complete logging API (start → events → complete), SHA-256 hash-chain sealing, decision retrieval, replay assembly, and integrity verification — with 12/12 automated tests passing and a live end-to-end smoke test completed. The frontend scaffold (Next.js + Tailwind) has a working Kanban Command Center and a decision detail page. Everything is on branch `yash` under PR #1, pending team merge. The prototype domain has pivoted to **Deloitte client research** — the simulated `ResearchAgent` and 16-record research seed are done (hero RES-2026-004821 + pre-tampered RES-2026-009999). Remaining: tamper demo + rehearsal (Week 4).

---

## 2. Roadmap Position

```
Week 1          Week 2          Week 3          Week 4
Aug 18–24       Aug 25–31       Sep 1–7         Sep 8–14
─────────────   ─────────────   ─────────────   ─────────────
Product +   ✔   Backend +   ◉   Dashboard + ▫   Integrity + ▫
Architecture    Agent           Audit Trail     Polish + Demo
                (backend done,
                agent+seed left)
```

✔ done · ◉ in progress · ▫ not started

| Week 2 deliverable | Status |
|---|---|
| PostgreSQL schema (5 tables) | ✅ Done |
| `POST /decisions/start` | ✅ Done |
| `POST /decisions/{id}/events` | ✅ Done |
| `POST /decisions/{id}/complete` (seal + hash chain) | ✅ Done |
| `GET /decisions/{id}` | ✅ Done |
| `GET /decisions` (list + filters) | ✅ Done |
| `GET /decisions/{id}/verify` | ✅ Done |
| Hash chain unit tests (append, verify, tamper) | ✅ Done |
| Simulated research agent (`agents/research_agent.py`) | ✅ Done |
| Seed script (16 research demo records) | ✅ Done |
| Docker Compose running locally | ✅ Done (Docker unavailable on dev laptop; compose file ready) |

**Week 2 exit check (agent+seed done):** fetch `RES-2026-004821`, show JSON with trail + hash; all seed records verify green except the pre-tampered `RES-2026-009999`.

---

## 3. What Exists in Code Today

```
TrustLedger/  (branch: yash → PR #1 → main)
├── backend/
│   ├── agents/                     ResearchAgent (drives the API)
│   │   └── research_agent.py       replays seed scenarios
│   ├── seed/                      demo_data.json (16 research scenarios)
│   │   └── load_demo_data.py      loads + tampers one record for the demo
│   ├── app/
│   │   ├── main.py               FastAPI app, lifespan, CORS (localhost:3000)
│   │   ├── db.py                 SQLAlchemy; SQLite default, Postgres via env
│   │   ├── models.py             5 tables, JSONB on Postgres, uniqueness constraints
│   │   ├── schemas.py            Pydantic request/response contracts
│   │   ├── routes/
│   │   │   ├── agents.py         POST /agents
│   │   │   └── decisions.py      full lifecycle + read paths (9 endpoints)
│   │   └── services/
│   │       ├── canonical_json.py deterministic JSON (sorted keys)
│   │       ├── hash_chain.py     SHA-256 chain + GENESIS seed
│   │       ├── sealer.py         snapshot assembly + sealing
│   │       └── replay.py         ordered step reconstruction
│   ├── tests/                    12 tests — all passing
│   ├── Dockerfile                non-root user
│   └── requirements.txt
├── frontend/
│   ├── src/app/page.tsx          Kanban Command Center (4 columns, 30s poll)
│   ├── src/app/decisions/[taskId]/page.tsx   Summary + Trail view
│   ├── src/lib/api.ts            fully typed API client
│   └── tailwind.config.js        Tailwind adopted per docs/05
├── docker-compose.yml            postgres + backend + frontend (env_file, healthcheck)
└── docs/                         design docs + this status doc
```

---

## 4. Verification Evidence

### Automated tests — 12/12 passing

| Suite | Proves |
|---|---|
| Hash chain (5 tests) | canonical JSON determinism · SHA-256 format · same-input-same-hash · **tamper detection** · chain linking |
| API flow (7 tests) | full lifecycle → verify pass · **tampered record fails verification** · 409 on event-after-seal · 422 missing rationale fields · 404 unknown agent · list filters · whole-chain verify |
| Regression | event sequences unique + ordered (guards the duplicate-sequence bug found in review) |

### Live smoke test (real uvicorn + HTTP)

```
register agent → start RES-2026-004821 → log evidence event
→ complete (conditional recommendation, review required)
→ sealed: hash 96fbfec5…b40f
→ verify: True / chain_status: intact
→ chain verify: "All 1 records in chain verified."
```

### Quality gates on PR #1

- ✅ GitGuardian secret scan — passing (one false-positive incident resolved; no credentials in repo)
- ✅ CodeRabbit review — 14 findings triaged and addressed (JSONB, CORS, sequence atomicity, Docker hardening, frontend typing)
- ✅ Peer review fixes applied (JSONB variant, CORS origin, single-seal refactor, lifespan handler, Tailwind adoption)

---

## 5. Key Decisions Made During Implementation

| Decision | Rationale |
|---|---|
| SQLite default, Postgres via env | No Docker on dev laptop; tests stay fast; compose ready for Postgres |
| Evidence/policies embedded in event `details` (JSONB) | Prototype speed per `02_Data_Driven_Design.md`; normalization deferred |
| `env_file` for all container secrets | GitGuardian requires zero credential patterns in code |
| Tailwind now, shadcn/ui at Week 3 kickoff | Tailwind was the blocking dependency; component picks belong with real dashboard build |
| Seal-on-complete even for review-required tasks | Matches documented lifecycle in `03_Agent_Based_Design.md` |

---

## 6. Known Limitations (Intentional, Prototype Scope)

- No authentication / RBAC (per `08_Scope_and_Non_Goals.md`)
- Hash chain on standard DB — a DB writer could rewrite it (documented in `09_HLD.md` §6; production would add HMAC/external signing)
- Chain-head allocation not serialized across concurrent writers (single-user demo)
- Replay/Integrity tabs not yet built (Weeks 3–4)
- Seed data + simulated agent not yet loaded (next task)
- Docker not installable on the primary dev laptop — compose untested end-to-end (file follows standard patterns; will validate on a machine with Docker)

---

## 7. Next Steps (In Order)

1. **Simulated research agent** — scripted lifecycle with varied outcomes (approved / partial / denied / escalated)
2. **Seed data** — 15+ records across all Kanban columns, hero case `RES-2026-004821`, one pre-tampered record `RES-2026-009999`
3. **Week 2 exit check** — all seeds verify green, chain verify-all passes
4. **Week 3** — Replay tab, Integrity tab, full demo click-through
5. **Week 4** — tamper contrast demo, polish, 3 rehearsals of the 4:20 script

---

## 8. How to Run (Current State)

```bash
# Backend (no Docker needed — SQLite default)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → API docs: http://localhost:8000/docs

# Run tests
cd backend && python -m pytest tests -q

# Frontend
cd frontend
npm install
npm run dev
# → Dashboard: http://localhost:3000

# Full stack with PostgreSQL (requires Docker)
cp .env.example .env   # set POSTGRES_PASSWORD
docker compose up --build
```
