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
| [docs/12_Graph_Knowledge_System.md](docs/12_Graph_Knowledge_System.md) | Evidence graph: what ships, and what does not |
| [docs/13_Review_Coverage_and_Load_Plan.md](docs/13_Review_Coverage_and_Load_Plan.md) | Review coverage + dashboard load <400ms plan |
| [docs/14_Frontend_Realism_Plan.md](docs/14_Frontend_Realism_Plan.md) | Frontend realism (Deloitte-grade) plan |
| [docs/README.md](docs/README.md) | Full project overview |

Source of truth for the problem statement: `TrustLedger_EOI_Enhanced.pptx`

---

## Status

**Sep 17 — reliability + UI pass.** The streaming research endpoint now runs in a
background task, so a browser navigating away mid-run still seals the record
instead of stranding the card in `running`; a wall-clock budget
(`TRUSTLEDGER_RUN_BUDGET`, default 75s) guarantees a run cannot hang. Runs land
in 4-10s on a pinned model. Truncated model JSON is repaired rather than dumped
as raw text, and a response carrying none of the expected fields is rejected
instead of sealing an empty record.

On the UI: a shared vocabulary (`frontend/src/lib/vocab.ts`) gives every status,
outcome and risk level one label, one colour and one plain-English meaning;
sealed records advertise their immutability instead of offering actions the API
refuses; the decision graph is redrawn as a single computed SVG; and the live
panel shows readable progress rather than raw JSON.

**Known limits — read before demoing:**
- Cited sources are **asserted by the model, not retrieved**. No URL, no fetch,
  no verification that a cited document exists. See `docs/12`.
- The hash chain is **unkeyed**. It detects a post-hoc edit, but anyone who can
  write to the database can recompute the whole chain. Tamper-evident, not
  tamper-proof.
- `GET /decisions/{id}` serves the sealed snapshot **without verifying it
  first**, so a tampered record still reads clean on the Summary tab. Fixing
  this is the top open item.
- The same question can return different outcomes across runs (temperature 0.4).
- There is **no authentication** on any endpoint.

Prior milestones: logging API, SHA-256 hash chain, Kanban + 4-tab record view,
research pivot, 16-record seed (hero `RES-2026-004821`, deliberately tampered
`RES-2026-009999`). `23/23` backend tests pass; frontend builds clean.

**Run:** put `OPENROUTER_API_KEY` in `.env`, then start the backend and frontend
(see `docs/README.md`). Note that **nothing in the backend loads `.env`** — there
is no `python-dotenv` — so a local `uvicorn` run needs the variables exported by
hand. Docker Compose picks them up via `env_file`.

`TRUSTLEDGER_MODEL` defaults to `openai/gpt-4o-mini`. The `openrouter/free`
router is cheaper but picks a different model per request: across three test
runs it returned one empty response and one web-search tool call instead of an
answer. Pin a model for anything you intend to demo.
