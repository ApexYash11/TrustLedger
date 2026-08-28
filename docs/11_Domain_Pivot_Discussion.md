# TrustLedger — Project Explanation & Domain Pivot Discussion

> This document captures (1) a plain-language explanation of the whole project,
> (2) the team's discussion of pivoting the demo domain from **insurance claims**
> to **Deloitte client research**, and (3) the agreed implementation plan.

---

## Part 1 — The Whole Project in Simple Words

### The Problem 🤔
AI agents now make big, high-stakes decisions — approving or denying insurance
claims, loans, etc. But when someone later asks *"Why did the AI deny this claim?
What data did it use?"* — companies often **can't answer**. They spend days
digging through logs to reconstruct what happened. That's a regulatory and legal
nightmare, and it's why most AI agents stay stuck in pilots instead of going
live in companies.

### The Idea 💡
**TrustLedger is a "trust layer" that sits next to the AI agent.** It doesn't
make decisions itself. Instead, it **listens while the agent works** and writes
down everything in a standard, tamper-proof format:

- What data the agent received (inputs)
- What evidence it looked at
- Which policy rules it applied
- A structured, plain-language reason for the decision
- The final outcome (approved / denied / partial)

Think of it like a **flight recorder (black box) for AI decisions** — written
*live*, not reconstructed afterward.

### How It Works (the pipeline) 🔗

```
AI Agent → Logging API → Tamper-proof Hash Chain → Dashboard → Replay & Verify
```

1. The agent calls the API as it works — `start` → `events` → `complete`.
2. Every record gets a **SHA-256 fingerprint** chained to the previous record —
   like a blockchain. If anyone secretly edits one record afterward, the chain
   "breaks" and the tampering is instantly visible.
3. Compliance officers open a dashboard (a Kanban board of cases), click one,
   read the decision in plain English, walk the step-by-step Decision Trail,
   **replay** the decision, and click **Verify** to confirm the record was never
   altered.

### What's Built Right Now 🏗️

| Component | Status |
|-----------|--------|
| Backend (FastAPI + Python) | Fully working — logging API, hash chain, replay, verify. **12/12 tests pass** |
| Simulated Claims Agent (`backend/agents/`) | Fake insurance claims agent that replays 16 seed scenarios through the API |
| Seed Data (`backend/seed/`) | 16 demo records across all Kanban columns, incl. a "hero" case and one deliberately tampered record |
| Frontend (Next.js + Tailwind) | Scaffold — Kanban board + case detail page; Replay/Integrity tabs coming in Week 3 |
| Docs (`docs/`) | 12 documents: PRD, architecture, demo script, roadmap |

### The Demo Pitch 🎬
1. Officer sees the Kanban board of AI-handled cases
2. Clicks a disputed case → reads the decision in **plain business language**
3. Walks the step-by-step **Decision Trail** with evidence and policy citations
4. **Replays** the decision from stored data
5. Clicks **Verify** → hash chain confirms nothing was altered (and shows the
   one deliberately tampered record failing)
6. Punchline: **"A multi-day investigation becomes a two-minute lookup."**

**One-sentence summary:** TrustLedger gives every AI decision a tamper-evident,
human-readable receipt — so compliance teams can explain, replay, and defend any
AI call in minutes instead of days.

---

## Part 2 — The Proposed Pivot: Deloitte Client Research

### The Idea (as discussed)
Replace the insurance/loan framing with **research that Deloitte does for its
clients**. The Kanban dashboard keeps the same shape — each card is a research
task for a different Deloitte client — and clicking a card shows everything
around that research: the client, the research question, the sources used, the
methodology applied, the recommendation and why, plus the tamper-proof audit
trail. Everything is manageable by everybody (partners, Q&R, engagement teams)
over time.

### Verdict: Good idea — arguably a *stronger* fit ✅

**Why it works well:**

1. **It's a Deloitte capstone** — evaluators will see *their own world* on
   screen (client engagements, deliverables, partner review) instead of an
   abstract insurance example. Huge demo advantage.
2. **The stakes are real and defensible.** Deloitte's research and analysis
   (market entry recommendations, due diligence, tax structuring, M&A
   screening) ends up in **signed deliverables with Deloitte's name on them**.
   A wrong AI-generated research conclusion = client loss, lawsuits, regulator
   exposure (audit/tax standards). That is exactly the "high-stakes AI
   decision" problem TrustLedger solves.
3. **The architecture survives untouched.** The Kanban board, decision records,
   hash chain, replay, and verify flows are domain-agnostic. Only the
   *vocabulary and data* change:

   | Insurance (old) | Deloitte Research (new) |
   |---|---|
   | Insurance claim | Research engagement for a client |
   | Claimant / policy number | Client name / engagement code |
   | Policy clause reference | Methodology & standard reference (DEL-RM methodology, ISA, independence rules) |
   | Adjuster report, photos | Market report, financial filings, data room, registry checks |
   | approved / denied / partial | recommended / recommended_with_caveats / not_recommended / escalated |
   | Regulator exposure | Deloitte Quality & Risk Management + engagement partners + professional standards |

4. **The Kanban idea maps 1:1** — each card = one research task for one client;
   the detail page = "everything around that research" (inputs, sources,
   methodology references, timeline, outcome, integrity proof).

**Two caveats we designed around:**

- "Research" alone is too vague — a decision record needs a *decision*. So all
  scenarios are scoped to **decision-shaped research**: "should the client
  enter this market?", "is this vendor a viable partner?", "is this
  acquisition target viable?" — each ends in a defensible recommendation.
- The insurance story had "regulators"; for Deloitte the equivalent is
  **internal Quality & Risk Management + engagement partners + professional
  standards** — the pivot makes that the framing so the "why does this matter"
  story stays sharp.

**Conclusion: keep the engine, swap the domain.**

---

## Part 3 — Implementation Plan (agreed)

### Vocabulary mapping

| Concept | Old (insurance) | New (Deloitte research) |
|---|---|---|
| Agent | `ClaimsReviewAgent` / `insurance_claims` | `ResearchAgent` / `deloitte_client_research` |
| Case IDs | `CLM-2026-XXXXXX` | `RES-2026-XXXXXX` |
| Case types | "Property Damage — Water", "Auto — Glass" | "Market Entry Assessment — EV Charging", "Vendor Due Diligence", "M&A Screening", etc. |
| Inputs | claimant_name, policy_number, claim_amount | client_name, engagement_code, research_question, review_deadline |
| Event types | unchanged (case_received, data_retrieved, policy_retrieved, clause_identified, evidence_evaluated, decision_generated, record_sealed) | same keys; display titles re-labelled ("Methodology Loaded", "Applicable Standard Identified", "Source Evaluated") |
| Outcomes | approved, partially_approved, denied, escalated | recommended, recommended_with_caveats, not_recommended, escalated |

### New seed scenarios (16 records total, same Kanban mix)

| # | Case ID | Client | Research task | Outcome |
|---|---------|--------|--------------|---------|
| 1 | RES-2026-004821 *(hero)* | Tata Power | Market entry — EV fast-charging, Rajasthan | recommended_with_caveats → partner review (competitor cost baseline fails methodology §5.3) |
| 2 | RES-2026-009999 *(tampered)* | Adani Logistics | Vendor due diligence — Velm Robotics | recommended_with_caveats (2 of 5 red flags) — **secretly edited post-seal for the integrity-fail demo** |
| 3 | RES-2026-006122 | AgriNova International | Market sizing — agri-drone exports | not_recommended (independence conflict, §1.2) |
| 4 | RES-2026-005177 | GlowRoot Naturals | Pricing benchmark — D2C personal care | recommended |
| 5 | RES-2026-005204 | BlueOrbit Capital | M&A screening — EV mobility target | escalated (undisclosed investigation, §8.4) |
| 6–12 | RES-2026-0053xx–56xx | 7 quick generated clients | Quick completed cases | varied |
| 13–14 | RES-2026-005701/5718 | Mahindra Electric, Ola Financials | Running (mid-research) | — |
| 15–16 | RES-2026-005801/5814 | Two queued clients | Queued | — |

### Files to change

| File | Change |
|------|--------|
| `backend/seed/demo_data.json` | Full rewrite → research scenarios (above) |
| `backend/seed/load_demo_data.py` | Agent name/domain, 7 quick templates, 2 running partials, 2 queued seeds, `_tamper_case` (red-flags phrase), event wording |
| `backend/agents/claims_agent.py` | Delete — replaced by `research_agent.py` |
| `backend/agents/research_agent.py` | New — same flow, ResearchAgent identity |
| `backend/app/schemas.py` | `VALID_OUTCOMES` → research vocabulary |
| `backend/app/routes/decisions.py` | "Claim … received for automated review" → "Research task … received for automated processing" |
| `backend/app/services/replay.py` | `EVENT_TYPE_TITLES` display labels for research |
| `backend/tests/test_api_flow.py` | Fixture + payloads on research data; all behavioral assertions unchanged |
| `backend/tests/conftest_helpers.py` | Tamper snapshot string |
| `frontend/src/app/page.tsx` | Subtitle → "Research Command Center · N engagements" |
| `frontend/src/app/layout.tsx` | Metadata for research framing |
| `README.md` (root + docs/) | Pivot the narrative from insurance to Deloitte client research |

**Kept unchanged on purpose:** API field names (`policy_reference`,
`policy_basis`, `evidence`, `exclusions_applied`) — they are generic enough
("policy" = firm policy/methodology) and renaming them would risk regressions
across schemas, sealer, replay, and frontend types with zero demo benefit.
Other `docs/00–10` documents keep the original insurance framing until the code
pivot is validated, then get a documentation pass.

### Validation checklist

1. `cd backend && python -m pytest tests -q` → 12/12 pass on research data
2. `python -m seed.load_demo_data --force` → reseeds local DB, prints
   verification report showing 15/16 intact + 1 tampered (RES-2026-009999)
3. `python -m agents.research_agent` (with API running) → replays scenarios
4. Frontend Kanban shows research engagements; hero case detail reads like a
   Deloitte research record

### Progress so far

- ✅ Assessment of the pivot idea (Part 2) — approved
- ✅ `backend/seed/demo_data.json` — rewritten: 5 hand-crafted research scenarios (hero, tampered, independence-decline, pricing, M&A escalate)
- ✅ `backend/seed/load_demo_data.py` — ResearchAgent identity, 7 research quick templates, 2 running, 2 queued, research `_tamper_case` (red-flags phrase), new queued seeds
- ✅ `backend/agents/research_agent.py` — created; `claims_agent.py` deleted
- ✅ `backend/app/schemas.py` — `VALID_OUTCOMES` → recommended / recommended_with_caveats / not_recommended / escalated
- ✅ `backend/app/routes/decisions.py` — start event now "Research task … received for automated processing"
- ✅ `backend/app/services/replay.py` — replay step titles re-labelled for research
- ✅ `backend/tests/` — all payloads/assertions on research data; **12/12 pass**
- ✅ Frontend — "Research Command Center · N engagements", updated metadata
- ✅ Validation: reseed via `python -m seed.load_demo_data --force` → 16 tasks, **11/12 sealed records intact, 1 tampered (RES-2026-009999)** — exactly the demo design
- ✅ Documentation pass — `docs/README.md`, `00–10` narrative, and technical examples (schema JSON, mock UI, agent pseudocode) all updated to the Deloitte client-research framing
- ✅ Root + docs README quick-link for `11_Domain_Pivot_Discussion.md` added

---

*Document created from the team discussion on 2026-08-28. Branch: `yash`.*



