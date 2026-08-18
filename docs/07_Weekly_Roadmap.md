# TrustLedger — Weekly Roadmap

> **Prototype Design Decision:** The EOI proposes a 12-week plan. The team's actual deadline is the **second week of September 2026** (~4 weeks from 18 August). This roadmap is compressed and **demo-first**.

---

## Timeline Overview

```
Week 1          Week 2          Week 3          Week 4
Aug 18–24       Aug 25–31       Sep 1–7         Sep 8–14
───────────     ───────────     ───────────     ───────────
Product +       Backend +       Dashboard +     Integrity +
Architecture    Agent           Audit Trail     Polish + Demo
───────────     ───────────     ───────────     ───────────
Demo story      API + seed      Kanban +        Verify +
locked          data working    trail + replay  live showcase
```

**Critical rule:** The end-to-end demo path must work by **end of Week 3**. Week 4 is polish, integrity UI, and rehearsal — not new features.

---

## Week 1 — Problem + Product Definition + Architecture

**Dates:** ~18–24 August 2026

### Goals

Lock the problem statement, MVP scope, data model, API contract, and demo story. No production code required this week, but schema and seed JSON should exist.

### Deliverables

- [x] Final problem statement (from EOI, not rewritten)
- [x] User personas
- [x] MVP scope and non-goals
- [x] Demo story (`06_Demo_Showcase_Flow.md`)
- [x] Data model (`02_Data_Driven_Design.md`)
- [x] API design (`03_Agent_Based_Design.md`)
- [x] Dashboard wireframes (`04_Dashboard_Design.md`)
- [ ] Seed JSON: 15 synthetic decision records (including CLM-2026-004821)
- [ ] Project scaffolding: `backend/` + `frontend/` + `docker-compose.yml`

### Team Roles

| Role | Focus |
|------|-------|
| Product / coordination | Finalize docs, demo script, seed data content |
| Backend | Scaffold FastAPI + PostgreSQL, review schema |
| Frontend | Scaffold Next.js, review dashboard IA |
| AI / agent | Design simulated agent event sequence |

### Exit Criteria

Documentation is coherent. Team agrees on demo claim (CLM-2026-004821). Schema is locked — no major changes after this week.

---

## Week 2 — Backend Foundation + Agent Integration

**Dates:** ~25–31 August 2026

### Goals

Working logging API, hash chain, simulated agent, and seeded records queryable via API. Dashboard can wait — API docs (`/docs`) prove the write path.

### Deliverables

- [ ] PostgreSQL schema (tables: agents, tasks, decision_events, decisions, audit_records)
- [ ] `POST /decisions/start`
- [ ] `POST /decisions/{id}/events`
- [ ] `POST /decisions/{id}/complete` (includes sealing + hash chain)
- [ ] `GET /decisions/{id}`
- [ ] `GET /decisions` (list for dashboard)
- [ ] `GET /decisions/{id}/verify`
- [ ] Hash chain unit tests (append, verify, tamper detection)
- [ ] Simulated claims agent (`agents/claims_agent.py`)
- [ ] Seed script loading 15+ demo records
- [ ] FastAPI running locally via Docker Compose

### Team Roles

| Role | Focus |
|------|-------|
| Backend | API + hash chain + tests |
| AI / agent | Simulated agent + seed data generation |
| Frontend | API client (`lib/api.ts`), stub dashboard with dummy data |
| Coordination | Seed data quality review (plain-language summaries) |

### Exit Criteria

```
POST start → POST events → POST complete → GET record → GET verify = 200 OK
```

All 15 seed records pass integrity verification. One tampered record exists for fail demo.

### Demo-first checkpoint

Can you open FastAPI `/docs`, fetch `CLM-2026-004821`, and show a JSON decision record with trail + hash? If yes, Week 2 is complete.

---

## Week 3 — Dashboard + Audit Trail + Replay

**Dates:** ~1–7 September 2026

### Goals

The evaluator-facing demo path works: Kanban → task detail → trail → replay. Integrity UI can still be a simple pass/fail this week.

### Deliverables

- [ ] Kanban dashboard (4 columns: Queued, Running, Review Required, Completed)
- [ ] Task cards (case ID, type, agent, decision, risk, duration)
- [ ] Decision Overview page (Summary tab)
- [ ] Decision Trail (chronological timeline)
- [ ] Decision Replay (step-through + auto-play)
- [ ] Evidence and policy display
- [ ] Basic Integrity tab (pass/fail from verify endpoint)
- [ ] End-to-end click-through of demo script Steps 1–6

### Team Roles

| Role | Focus |
|------|-------|
| Frontend | Kanban, detail page, timeline, replay |
| Backend | `GET /decisions/{id}/replay` endpoint, list filters |
| AI / agent | Live agent run during demo (optional); polish seed data |
| Coordination | Dry-run demo script against working UI |

### Exit Criteria

A team member who did not write the frontend can complete the 3–5 minute demo script (Steps 1–6) without backend intervention.

**This is the most important week.** If the dashboard isn't demoable by Sunday 7 September, cut Should-Have features immediately.

### Cut list if behind

Drop in this order:

1. Auto-play replay (manual Next is enough)
2. Live agent during demo (pre-seeded records only)
3. Disputed badge / extra filters
4. Duration / processing time display

---

## Week 4 — Integrity + Polish + Demo

**Dates:** ~8–14 September 2026 (showcase week)

### Goals

Integrity verification UI is evaluator-ready. UX is polished. Demo is rehearsed. No new features after Wednesday.

### Deliverables

- [ ] Integrity panel: plain-language pass/fail, chain of custody visual, expandable technical hashes
- [ ] "Verify Now" live re-check
- [ ] Tampered-record contrast demo (CLM-2026-009999)
- [ ] UX refinement: spacing, badges, empty states, loading states
- [ ] End-to-end testing of demo path
- [ ] Demo dataset freeze (no more seed data changes after Tuesday)
- [ ] Fallback: static JSON mode if backend fails during presentation
- [ ] Rehearsal: 3 full run-throughs of 4:20 script
- [ ] Informal comprehension check with 1–2 non-technical reviewers

### Team Roles

| Role | Focus |
|------|-------|
| Frontend | Integrity UI polish, visual QA |
| Backend | Tamper demo, chain verify-all endpoint |
| AI / agent | Optional LLM agent if already working; otherwise skip |
| Coordination | Demo rehearsal, talking points, fallback plan |

### Feature freeze

**Wednesday of Week 4:** no new features. Only bug fixes and demo reliability.

### Showcase day

Follow `06_Demo_Showcase_Flow.md`. Keep to 4:20. Leave time for questions.

---

## Mapping to EOI 12-Week Plan

| EOI Phase | EOI Weeks | Compressed Into |
|-----------|-----------|-----------------|
| Schema + design | 1–2 | Week 1 |
| Logging engine | 3–5 | Week 2 |
| Agent integration | 6–8 | Week 2 |
| Dashboard + replay | 9–10 | Week 3 |
| Testing + demo | 11–12 | Week 4 |

What was dropped from the 12-week plan (intentional):

- OpenSearch / Elasticsearch
- Multi-week usability testing
- Production-style RBAC and encryption
- Multiple agent types
- GraphQL dual API

---

## Risk Calendar

| Week | Biggest risk | Mitigation |
|------|--------------|------------|
| 1 | Schema churn | Lock schema Friday; changes after that require team agreement |
| 2 | Hash chain bugs | Write tests first; pre-compute hashes for seed data |
| 3 | Frontend too ambitious | Build Summary + Trail first; Replay can be a sequential list |
| 4 | Demo breakage | Freeze data Tuesday; have static fallback; rehearse 3× |

---

## Definition of "Demo Works Early"

By end of **Week 2**: JSON record of CLM-2026-004821 is retrievable and verifiable.

By end of **Week 3**: Full UI click-through of Steps 1–6.

By **Tuesday of Week 4**: Integrity UI + tamper contrast.

By **showcase day**: Rehearsed 4:20 narrative with fallbacks.
