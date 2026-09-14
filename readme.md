# TrustLedger

**Enterprise AI Decision Audit & Trust Layer**  
Deloitte Capstone 2026 · Team Diet Coke · Manipal University Jaipur

TrustLedger wraps around existing AI agents and captures a standardized, tamper-evident decision record **while the decision is happening** — so compliance and audit teams can understand, replay, and defend high-stakes AI decisions in minutes, not days.

The agent decides. TrustLedger records and verifies.

---

## Quick links

| Document | What it covers |
|----------|----------------|
| [docs/00_Project_Summary.md](docs/00_Project_Summary.md) | Thesis, MVP, risks, next priorities |
| [docs/01_PRD.md](docs/01_PRD.md) | Product requirements |
| [docs/02_Data_Driven_Design.md](docs/02_Data_Driven_Design.md) | Schema and example decision record |
| [docs/03_Agent_Based_Design.md](docs/03_Agent_Based_Design.md) | Agent integration and API contract (incl. streaming research) |
| [docs/04_Dashboard_Design.md](docs/04_Dashboard_Design.md) | Kanban, knowledge graph, trail, replay, integrity UI |
| [docs/05_Tech_Stack_and_Architecture.md](docs/05_Tech_Stack_and_Architecture.md) | Stack choices and architecture (FastAPI + OpenRouter + hash chain) |
| [docs/06_Demo_Showcase_Flow.md](docs/06_Demo_Showcase_Flow.md) | 3–5 minute evaluator demo script |
| [docs/07_Weekly_Roadmap.md](docs/07_Weekly_Roadmap.md) | 4-week plan to second week of September |
| [docs/08_Scope_and_Non_Goals.md](docs/08_Scope_and_Non_Goals.md) | What we will and will not build |
| [docs/09_HLD.md](docs/09_HLD.md) | High-level design with diagrams |
| [docs/10_Current_Status.md](docs/10_Current_Status.md) | Implementation status and evidence (updated Sep 14) |
| [docs/11_Domain_Pivot_Discussion.md](docs/11_Domain_Pivot_Discussion.md) | Assessment + plan for the Deloitte client-research pivot |
| [docs/12_Graph_Knowledge_System.md](docs/12_Graph_Knowledge_System.md) | Graph-shaped evidence: nodes, edges, provenance |
| [docs/13_Review_Coverage_and_Load_Plan.md](docs/13_Review_Coverage_and_Load_Plan.md) | Review coverage + dashboard load <400ms plan |
| [docs/14_Frontend_Realism_Plan.md](docs/14_Frontend_Realism_Plan.md) | Frontend realism (Deloitte-grade) plan |
| [docs/README.md](docs/README.md) | Full project overview |

Source of truth for the problem statement: `TrustLedger_EOI_Enhanced.pptx`

---

## Status

**Sep 14 — feat/live-research-openrouter (PR #22):** Real research agent via **OpenRouter `openrouter/free` router** (free, no credits), SSE `POST /api/v1/research/stream` (`status → token* → done`), knowledge-graph decision record with linked evidence/policy nodes (`frontend/src/components/DecisionGraph.tsx`), minimal board (single `Add Task`, `Ask a research question…` prompt), deduped detail view, `23/23` tests pass. Prior milestones: full logging API, SHA-256 hash chain, Kanban + 4-tab overview, research pivot + 16-record seed (hero `RES-2026-004821`, tampered `RES-2026-009999`) — see `docs/10_Current_Status.md`.

**Branches:** `main` ← `feat/live-research-openrouter` (PR #22) · `docs/refresh-readme-and-docs` (this docs refresh). Closed superseded: #11, #18, #19 (all folded into #22).

**Run:** `TRUSTLEDGER_MODEL=openrouter/free` + `OPENROUTER_API_KEY` in `.env` → `POST /research/stream` streams live. See `docs/README.md` for architecture, how to run, and limitations.
