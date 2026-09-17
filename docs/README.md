# TrustLedger

**Enterprise AI Decision Audit & Trust Layer**  
Deloitte Capstone 2026 · Team Diet Coke · Manipal University Jaipur

---

## What is TrustLedger?

TrustLedger is a trust layer that wraps around existing AI agents. It does **not** make business decisions. It captures a standardized, tamper-evident decision record **while the decision is happening**, then presents it to compliance, audit, and legal teams in language they can understand.

When an AI agent approves, denies, or partially approves a high-stakes case — a market-entry analysis, a vendor due-diligence or M&A screening recommendation — TrustLedger records the evidence, methodology references, structured rationale, and a cryptographic audit trail so the organization can later explain and defend that call.

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
AI Agent (ResearchAgent via OpenRouter) → Logging API + Research Stream → Hash-Chained Log → Knowledge Graph → Trust Dashboard → Replay/Verify
```

A standardized **decision record** is created live, containing:

- Inputs and outputs
- Evidence retrieved during the decision (typed `evidence` nodes)
- Policy clauses applied (typed `policy_reference` nodes)
- Structured rationale (never raw model chain-of-thought)
- Chronological decision events + evidence/standard links (`supports` / `applies_to`) — see `docs/12` for what is and is not built
- Tamper-evident SHA-256 hash chain

The same core schema works across industries; only the methodology/standard references change. The prototype demonstrates this on **Deloitte client research** with streaming research via `POST /api/v1/research/stream` and a visual evidence graph (`DecisionGraph`).

---

## How It Works

1. Query enters via `POST /api/v1/research/stream` (`{query, agent_domain}`) — or via `POST /decisions/queue` for dispatcher mode. The `ResearchAgent` calls OpenRouter (`TRUSTLEDGER_MODEL`, default `openai/gpt-4o-mini`) or falls back to the template if no key is set.
2. TrustLedger streams tokens (`data: {type:"token"}`) while appending linked evidence/policy events, then seals the record with a SHA-256 hash chained to the previous record.
3. A compliance officer opens the **Research Command Center** (minimal Kanban), clicks a task, inspects the **Knowledge Graph** (client → question → evidence/policy → recommendation), walks the **Decision Trail**, **Replays** steps, and **Verifies** chain integrity.
4. `GET /decisions/{id}/verify` and `GET /decisions/chain/verify` prove no post-seal tampering (tampered `RES-2026-009999` demonstrates failure).

The agent keeps deciding. TrustLedger makes those decisions auditable and replayable.

---

## Architecture

```
Browser (Next.js dashboard — Kanban + DecisionGraph + Timeline/Replay/Integrity)
        │
        ▼
FastAPI (logging, research stream, replay, verification)
        │  ├─ OpenRouter LLM service (app/services/llm.py — TRUSTLEDGER_MODEL)
        │  └─ Hash Chain Engine (SHA-256) + Replay Engine
        │
        ▼
PostgreSQL (decisions, events, audit_records) — SQLite fallback for local/tests
        │
ResearchAgent / ComplianceBot ──► POST /research/stream (streaming) or POST /decisions/start|events|complete
```

See `docs/05_Tech_Stack_and_Architecture.md` for the full diagram and rationale.

---

## Demo Flow (3–5 minutes)

1. Open Research Command Center — minimal board, `Ask a research question…`
2. Type “Should DMart launch quick-commerce in Pune?” → watch tokens stream, card `Queued → Running → Completed`
3. Click the new card → Knowledge Graph shows how evidence/policy link to the recommendation
4. Walk Decision Trail (chronological why)
5. Replay steps (read-only, no re-execution)
6. Verify hash-chain integrity (green `Verified` vs red `Tampered` on `RES-2026-009999`)
7. Close: multi-day investigation → two-minute lookup

Full script: `docs/06_Demo_Showcase_Flow.md`

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14, React, TypeScript, Tailwind — `DecisionGraph`, `DecisionTimeline`, `ReplayViewer`, `IntegrityPanel` |
| Backend | FastAPI (Python) — logging, research SSE, replay, verify |
| LLM | OpenRouter (`app/services/llm.py`); model from `TRUSTLEDGER_MODEL`, default `openai/gpt-4o-mini` |
| Database | PostgreSQL (JSONB) / SQLite fallback |
| Integrity | SHA-256 hash chaining with `GENESIS` seed |
| Agent | `ResearchAgent` v1.3.0 (`deloitte_client_research`) + `ComplianceBot`, dispatcher 0.7s, SSE live |
| Runtime | Docker Compose + local `uvicorn`/`next dev`, 23 tests |

---

## Project Structure

```
TrustLedger/
├── docs/                          Product and engineering documents (00–14)
├── TrustLedger_EOI_Enhanced.pptx  Deloitte Capstone EOI (source of truth)
├── backend/                       FastAPI — 23 tests passing
│   ├── app/services/llm.py        OpenRouter streaming service
│   ├── app/routes/research.py     POST /research/stream SSE
│   ├── agents/research_agent.py   LLM + template fallback
│   └── app/services/hash_chain.py SHA-256
├── frontend/                      Next.js — Kanban + Knowledge Graph + tabs
│   ├── src/components/DecisionGraph.tsx
│   └── src/lib/api.ts (streamResearch)
└── docker-compose.yml
```

---

## How to Run Locally

```bash
# 1. Env (OpenRouter free — no credits needed)
cp .env.example .env  # set OPENROUTER_API_KEY=... ; TRUSTLEDGER_MODEL=openai/gpt-4o-mini

# 2. Backend (no Docker needed)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000  # → http://localhost:8000/docs

# 3. Tests
cd backend && python -m pytest tests -q  # 23 passed

# 4. Frontend
cd frontend
npm install
npm run dev  # → http://localhost:3000

# 5. Full stack with PostgreSQL
docker compose up --build

# 6. Live streaming research
curl -N -X POST http://localhost:8000/api/v1/research/stream -H "Content-Type: application/json" \
  -d '{"query":"Should Tata Power enter Rajasthan EV charging in FY27?"}'
```

Query via UI prompt `Ask a research question…` — tokens stream, Kanban card moves live.

---

## Current Prototype Limitations

- No authentication/RBAC (intentional per `08_Scope_and_Non_Goals.md`)
- Hash chain on standard PostgreSQL, not WORM/HSM
- `openrouter/free` is a router that picks a different model per request; pin `TRUSTLEDGER_MODEL` for predictable output
- Single org, two agents, synthetic data
- Search is PostgreSQL `ILIKE` (OpenSearch deferred)

---

## Timeline

**Sep 14 target:** `feat/live-research-openrouter` (PR #22) ships real streaming + graph + board declutter.

| Week | Focus |
|------|-------|
| 1 | Product, schema, API, demo story |
| 2 | Backend, hash chain, ResearchAgent, seed (16 records) |
| 3 | Dashboard, trail, replay, integrity |
| 4 | Streaming research (OpenRouter), evidence graph, polish, docs refresh |

EOI described 12 weeks; capstone compressed to ~4. See `07_Weekly_Roadmap.md`, `10_Current_Status.md`, `13_Review_Coverage_and_Load_Plan.md`, `14_Frontend_Realism_Plan.md`.

---

## Positioning

**One sentence:** TrustLedger creates tamper-evident, business-readable audit records for high-stakes AI agent decisions — so compliance teams can understand, replay, and defend every call in minutes, not days.

---

## Team

Manipal University Jaipur — Diet Coke — Suryanshi Singh, Shivansh Tripathi, Yash Mishra, Yash Maheswari, Yash Khanduri
