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
| [docs/03_Agent_Based_Design.md](docs/03_Agent_Based_Design.md) | Agent integration and API contract |
| [docs/04_Dashboard_Design.md](docs/04_Dashboard_Design.md) | Kanban, trail, replay, integrity UI |
| [docs/05_Tech_Stack_and_Architecture.md](docs/05_Tech_Stack_and_Architecture.md) | Stack choices and architecture |
| [docs/06_Demo_Showcase_Flow.md](docs/06_Demo_Showcase_Flow.md) | 3–5 minute evaluator demo script |
| [docs/07_Weekly_Roadmap.md](docs/07_Weekly_Roadmap.md) | 4-week plan to second week of September |
| [docs/08_Scope_and_Non_Goals.md](docs/08_Scope_and_Non_Goals.md) | What we will and will not build |
| [docs/09_HLD.md](docs/09_HLD.md) | High-level design with diagrams |
| [docs/10_Current_Status.md](docs/10_Current_Status.md) | Implementation status and evidence |
| [docs/README.md](docs/README.md) | Full project overview |

Source of truth for the problem statement: `TrustLedger_EOI_Enhanced.pptx`

---

## Status

Phase 1 implemented and tested on branch `yash` (PR #1): full logging API, SHA-256 hash chain with tamper detection (12/12 tests), Kanban dashboard scaffold with Tailwind. See `docs/10_Current_Status.md`.

**Target demo:** second week of September 2026.

See `docs/README.md` for architecture, how to run, and limitations.
