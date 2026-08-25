# TrustLedger

**Enterprise AI Decision Audit & Trust Layer**  
Deloitte Capstone 2026 · Team Diet Coke · Manipal University Jaipur

---

## What is TrustLedger?

TrustLedger is a trust layer that wraps around existing AI agents. It does **not** make business decisions. It captures a standardized, tamper-evident decision record **while the decision is happening**, then presents it to compliance, audit, and legal teams in language they can understand.

When an AI agent approves, denies, or partially approves a high-stakes case — an insurance claim, a loan, a hiring recommendation — TrustLedger records the evidence, policy references, structured rationale, and a cryptographic audit trail so the organization can later explain and defend that call.

---

## Problem

AI agents already make high-stakes decisions, but organizations cannot easily explain **what data drove the decision** or **what alternatives existed**.

- Regulatory exposure from indefensible AI decisions
- Multi-day manual reconstruction when a decision is disputed
- No shared record format across business units
- Trust gaps keeping most agentic AI stuck in pilots (only ~11% of orgs have agents in production vs. ~38% piloting)

If unsolved, AI stays confined to low-stakes work.

---

## Solution

TrustLedger sits between the agent and the people who need to trust its output:

```
AI Agent → Logging API → Hash-Chained Immutable Log → Trust Dashboard → Decision Replay
```

A standardized **decision record** is created live, containing:

- Inputs and outputs
- Evidence retrieved during the decision
- Policy clauses applied
- Structured rationale (never raw model chain-of-thought)
- Chronological decision events
- Tamper-evident hash chain

The same core schema works across industries; only the policy references change. The prototype demonstrates this on **insurance claims**.

---

## How It Works

1. An existing AI agent calls TrustLedger's logging API as it works (`start` → `events` → `complete`).
2. TrustLedger stores each step, links evidence and policies, and seals the record with a SHA-256 hash chained to the previous record.
3. A compliance officer opens the **Agent Command Center** (Kanban dashboard), clicks a task, and inspects the decision.
4. They walk the **Decision Trail**, **Replay** the decision from stored data, and **Verify** that the record has not been altered.

The agent keeps deciding. TrustLedger makes those decisions auditable.

---

## Architecture

```
Browser (Next.js dashboard)
        │
        ▼
FastAPI (logging, replay, verification)
        │
        ▼
PostgreSQL (decision records + hash chain)

Simulated Claims Agent ──► FastAPI logging endpoints
```

See `docs/05_Tech_Stack_and_Architecture.md` for the full diagram and rationale.

---

## Demo Flow (3–5 minutes)

1. Open the Agent Command Center — see what agents are doing
2. Click a high-risk disputed claim
3. Show the decision in plain language
4. Walk the Decision Trail
5. Show evidence and policy references
6. Replay the decision
7. Verify hash-chain integrity
8. Close on business value: multi-day investigation → two-minute lookup

Full script: `docs/06_Demo_Showcase_Flow.md`

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js, React, TypeScript, Tailwind |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| Integrity | SHA-256 hash chaining |
| Agent | Simulated Python claims agent (optional LLM API) |
| Runtime | Docker Compose, local demo |

---

## Project Structure

```
TrustLedger/
├── docs/                          Product and engineering documents
│   ├── 00_Project_Summary.md
│   ├── 01_PRD.md
│   ├── 02_Data_Driven_Design.md
│   ├── 03_Agent_Based_Design.md
│   ├── 04_Dashboard_Design.md
│   ├── 05_Tech_Stack_and_Architecture.md
│   ├── 06_Demo_Showcase_Flow.md
│   ├── 07_Weekly_Roadmap.md
│   ├── 08_Scope_and_Non_Goals.md
│   ├── 09_HLD.md
│   └── 10_Current_Status.md
├── TrustLedger_EOI_Enhanced.pptx  Deloitte Capstone EOI (source of truth)
├── backend/                       FastAPI app — implemented, tested (12/12 passing)
├── frontend/                      Next.js dashboard — scaffold implemented
└── README.md
```

---

## How to Run Locally

Backend runs standalone on SQLite; the full stack uses Docker Compose + PostgreSQL.

```bash
# Backend (no Docker needed)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Run tests
cd backend && python -m pytest tests -q

# Frontend
cd frontend
npm install
npm run dev

# Full stack with PostgreSQL (requires Docker)
cp .env.example .env   # set POSTGRES_PASSWORD
docker compose up --build
```

Dashboard: `http://localhost:3000`  
API docs: `http://localhost:8000/docs`

Seed demo data: `python -m seed.load_demo_data` (coming with the simulated agent, Week 2)

---

## Current Prototype Limitations

- Backend implemented and tested; simulated agent and seed data still pending (Week 2)
- Replay and Integrity UI tabs not yet built (Weeks 3–4)
- No authentication or RBAC
- Hash chain on standard PostgreSQL, not WORM/HSM storage
- One domain, one simulated agent, synthetic data
- No real enterprise system integrations
- Search is PostgreSQL-only (OpenSearch deferred)

These are intentional. See `docs/08_Scope_and_Non_Goals.md`.

---

## Timeline

**Target demo:** second week of September 2026 (~4 weeks).

| Week | Focus |
|------|-------|
| 1 | Product, schema, API, demo story |
| 2 | Backend, hash chain, simulated agent, seed data |
| 3 | Dashboard, trail, replay |
| 4 | Integrity UI, polish, rehearsal |

The EOI described 12 weeks; this capstone is compressed. Details: `docs/07_Weekly_Roadmap.md`.

---

## Positioning

**One sentence:** TrustLedger creates tamper-evident, business-readable audit records for high-stakes AI agent decisions — so compliance teams can understand, replay, and defend every call in minutes, not days.

Traditional monitoring tells you what happened technically. TrustLedger creates a business-readable record of **why an AI decision can be defended**.

---

## Team

Manipal University Jaipur — Diet Coke

- Suryanshi Singh
- Shivansh Tripathi
- Yash Mishra
- Yash Maheswari
- Yash Khanduri

---

## Documents

Start with [`docs/00_Project_Summary.md`](docs/00_Project_Summary.md), then the numbered docs in order.
