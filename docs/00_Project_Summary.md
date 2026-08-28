# TrustLedger — Project Summary

> **Team:** Diet Coke · Manipal University Jaipur  
> **Capstone:** Deloitte Capstone 2026  
> **Target demo date:** Second week of September 2026 (~4 weeks from project start)

---

## 1. Product Thesis

**TrustLedger** is an enterprise AI decision audit and trust layer. It wraps around existing AI agents — it does not make business decisions itself — and captures a standardized, business-readable decision record **while the decision is happening**, not after a dispute forces manual reconstruction.

The core story for evaluators:

> AI agents are making increasingly important decisions. TrustLedger captures the evidence and decision context as the decision happens, presents it through a simple operational dashboard, lets a human replay the decision later, and provides tamper-evident proof of the recorded audit trail.

---

## 2. Problem

Agents already make high-stakes calls in consulting, financial advice, and corporate operations — but organizations cannot easily explain **what data drove the recommendation** or **what alternatives existed**.

| Impact | Consequence |
|--------|-------------|
| Regulatory exposure | Indefensible AI recommendations create professional-standards and client liability risk |
| Operational cost | Disputes require slow, expensive manual reconstruction across scattered logs |
| Fragmentation | Every business unit invents its own logging approach — no shared standard |
| Adoption ceiling | Only ~11% of orgs have agents in production vs. ~38% piloting; trust gaps are a key blocker |

If unsolved, AI stays confined to low-stakes work because high-stakes workflows lack an auditable, defensible record.

*Source: Deloitte Capstone EOI (TrustLedger_EOI_Enhanced.pptx)*

---

## 3. Solution

TrustLedger sits between the AI agent and the people who need to trust its output:

```
AI Agent → Logging API → Hash-Chained Immutable Log → Search/Index → Trust Dashboard → Decision Replay
```

It produces a **standardized decision record** containing:

- Inputs and outputs
- Evidence retrieved during the decision
- Policy references and rules applied
- Structured rationale (not raw chain-of-thought)
- Chronological decision events
- Tamper-evident hash chain

**Prototype Design Decision:** The primary UI is an **Agent Command Center / Kanban Dashboard** — inspired by operational agent tools (e.g., AI Agent Orchestrator) for task visibility, but TrustLedger's core value is **decision auditability**, not orchestration.

---

## 4. MVP (Prototype Success Criteria)

The prototype succeeds if an evaluator can, in a 3–5 minute demo:

1. See AI agent tasks on a Kanban dashboard
2. Open a high-risk client-research recommendation
3. Understand **what** was decided and **why** (evidence + policy)
4. Replay the decision step-by-step from the stored record
5. Verify the record has not been tampered with (hash-chain check)

**In scope:** One domain (Deloitte client research), one simulated agent, synthetic data, ~10–20 pre-seeded decision records, working dashboard, replay, and integrity verification.

**Out of scope:** Production auth/RBAC, real PII, enterprise integrations, multi-agent orchestration, regulatory certification.

---

## 5. Architecture (Prototype)

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | Next.js + React | Kanban dashboard, decision detail, trail, replay, integrity UI |
| Backend | FastAPI (Python) | Logging API, decision retrieval, replay, verification |
| Database | PostgreSQL | Decision records, events, evidence, hash chain |
| Agent | Simulated Python agent (+ optional LLM API) | Generates synthetic research recommendations and logs to TrustLedger |
| Integrity | SHA-256 hash chaining | Tamper-evidence on standard PostgreSQL |

**Prototype Design Decision:** OpenSearch/Elasticsearch (mentioned in EOI) is **deferred** — PostgreSQL full-text search is sufficient for ~20 demo records.

---

## 6. Main Screens

| Screen | Purpose | Answers |
|--------|---------|---------|
| Agent Command Center (Kanban) | Operational entry point | What is happening? |
| Decision Overview | Task/case summary | What decision was made? |
| Decision Trail | Chronological timeline | Why was it made? |
| Decision Replay | Step-by-step reconstruction | Can we reconstruct it? |
| Integrity View | Hash chain verification | Can we verify it wasn't altered? |

Kanban columns: **Queued → Running → Review Required → Completed**

---

## 7. Data Model (Summary)

Core entities (logical; may map to fewer DB tables):

- **Agent** — which AI system made the decision
- **Task** — a unit of work (e.g., one research engagement)
- **Decision** — final outcome + structured rationale
- **Decision Event** — chronological audit steps
- **Evidence** — documents/data retrieved and evaluated
- **Policy Reference** — rules/clauses applied
- **Audit Record** — sealed, hash-chained snapshot

See `02_Data_Driven_Design.md` for full schema and example JSON.

---

## 8. Agent Integration (Summary)

TrustLedger observes; it does not decide.

```
POST /decisions/start          → open a decision record
POST /decisions/{id}/events    → log each step (evidence, policy, evaluation)
POST /decisions/{id}/complete  → seal record + append to hash chain
GET  /decisions/{id}           → full decision record
GET  /decisions/{id}/replay    → ordered replay payload
GET  /decisions/{id}/verify    → integrity check result
```

Existing agents integrate by calling these endpoints at decision lifecycle points — no agent rebuild required.

See `03_Agent_Based_Design.md` for full contract.

---

## 9. Demo Flow (Summary)

1. Open Agent Command Center — "This is where we see what our AI agents are doing."
2. Click a high-risk engagement in **Review Required**
3. Show decision outcome and risk level
4. Open Decision Trail — chronological steps
5. Show evidence and policy references
6. Run Decision Replay
7. Show hash/integrity verification — "This proves nothing was altered after the fact."
8. Close with business value — multi-day investigation → two-minute lookup

Full script: `06_Demo_Showcase_Flow.md`

---

## 10. Weekly Roadmap (4-Week Compressed Timeline)

**Prototype Design Decision:** EOI proposes 12 weeks; team deadline is **second week of September 2026** (~4 weeks). Roadmap is compressed and demo-first.

| Week | Dates (approx.) | Focus | Key Deliverable |
|------|-----------------|-------|-----------------|
| 1 | Aug 18–24 | Product + architecture + schema | Locked data model, API spec, demo story, seed data design |
| 2 | Aug 25–31 | Backend + agent | Logging API, hash chain, simulated agent, 10+ seeded records |
| 3 | Sep 1–7 | Dashboard + audit trail | Kanban UI, decision detail, timeline, replay |
| 4 | Sep 8–14 | Integrity + polish + demo | Verification UI, end-to-end demo, UX refinement |

**Critical rule:** End-to-end demo path must work by end of Week 3; Week 4 is polish only.

Full roadmap: `07_Weekly_Roadmap.md`

---

## 11. Non-Goals

- Enterprise authentication / full RBAC
- Production-grade immutable storage (WORM, HSM key management)
- Multiple enterprise system integrations
- Full multi-agent orchestration platform
- Advanced model explainability (SHAP/LIME-style)
- Production regulatory certification
- Distributed infrastructure (Kafka, Kubernetes)
- Real customer PII

See `08_Scope_and_Non_Goals.md`

---

## 12. Biggest Technical Risks

| Risk | Mitigation |
|------|-----------|
| **4-week timeline too tight** | Demo-first: seed data + read-only dashboard before live agent; cut OpenSearch, auth, multi-agent |
| **Hash chain implementation bugs** | Unit-test chain append/verify; pre-compute demo records with known-good hashes |
| **Over-scoping the data schema** | Start with flat JSONB decision record + events table; normalize later |
| **Agent integration delays** | Simulated agent with hardcoded event sequence; LLM optional |
| **Dashboard UX complexity** | Kanban with 4 columns only; one detail page with tabs (Overview / Trail / Replay / Integrity) |

---

## 13. Biggest Presentation Risks

| Risk | Mitigation |
|------|-----------|
| **Looks like agent monitoring, not audit** | Lead demo with dispute/investigation story, not "watching agents run" |
| **Too technical for compliance persona** | Use plain language, policy clauses, evidence labels — no ML jargon |
| **Integrity demo fails live** | Pre-verify all seed records; show green checkmark before live tamper demo |
| **Empty or broken dashboard** | Pre-seed 15+ records across all Kanban columns before demo |
| **Confusing TrustLedger with the agent** | Explicitly state: "The agent decided; TrustLedger recorded and verified." |

---

## 14. Next 3 Engineering Priorities

1. **Lock decision record schema + seed JSON** — unblocks backend, agent, and frontend in parallel
2. **Implement logging API + hash chain** — core differentiator; must work before dashboard
3. **Build Kanban dashboard with one complete decision detail flow** — demo path by end of Week 3

---

## What We Should NOT Build

Features that look impressive but distract from the core concept:

- Real-time WebSocket agent streaming
- Multi-tenant org management
- Custom RBAC permission editor
- SHAP/LIME explainability charts
- Blockchain integration (hash chain on PostgreSQL is sufficient for demo)
- Full-text search across thousands of records (OpenSearch)
- Multiple domain workflows (stick to client research)
- Agent builder / prompt editor
- Mobile app
- Email/Slack notification system
- Export to PDF/compliance report generator (nice but not MVP)

---

## PPT vs. Prototype — Design Decisions Log

| Topic | EOI (PPT) | Prototype Decision | Label |
|-------|-----------|-------------------|-------|
| Timeline | 12 weeks | ~4 weeks (Sep 2nd week deadline) | Prototype Design Decision |
| Dashboard UX | "searchable dashboard" | Kanban Agent Command Center | Prototype Design Decision |
| Search | OpenSearch/Elasticsearch | PostgreSQL queries only | Prototype Design Decision |
| Domain | Insurance claims or lending (original EOI) | Deloitte client research (pivoted) | Prototype Design Decision |
| Agent count | One simulated agent | One simulated agent | Aligned |
| Hash chaining | Standard DB demo | SHA-256 on PostgreSQL | Aligned |
| KPIs | <2 min reconstruction, 100% tamper-evidence, ≥90% comprehension | Same targets for demo | Aligned |

---

## Product Positioning

**One sentence:**  
TrustLedger creates tamper-evident, business-readable audit records for high-stakes AI agent decisions — so compliance teams can understand, replay, and defend every call in minutes, not days.

**30 seconds:**  When AI agents draft client recommendations — market entry, due diligence, M&A screening — organizations struggle to explain why. TrustLedger wraps around existing agents and captures evidence, methodology references, and structured rationale as the decision happens — not after a dispute. QRM and engagement teams get a searchable dashboard, one-click decision replay, and cryptographic proof the record wasn't altered. Same schema works across service lines; we demo it on **Deloitte client research**.

**2 minutes:**  
High-stakes AI decisions are already happening, but only 11% of organizations have agents in production because they can't defend those decisions. Today, investigating a disputed recommendation means manually reconstructing working papers across systems — taking days and creating professional-standards and client-liability exposure. TrustLedger solves this with a standardized decision record created live during agent execution. An API-first logging layer captures inputs, evidence, methodology clauses, engagement events, and structured rationale — never raw model chain-of-thought. Records are hash-chained for tamper evidence. A Trust Dashboard — starting with a Research Command Center — lets business users see active engagements, open any case, walk through the decision trail, replay the reasoning step-by-step, and verify integrity. The agent keeps recommending; TrustLedger makes those calls auditable. Our prototype uses a simulated research agent with synthetic data to demonstrate the full flow in under five minutes.

---

## Competitive Differentiation (Conceptual)

| Approach | What it tells you | Gap TrustLedger fills |
|----------|-------------------|----------------------|
| Agent monitoring | Agent ran, task status, errors | No business-readable "why" |
| Application logging | Technical debug traces | Not structured for compliance |
| Model explainability (SHAP/LIME) | Feature importance for data scientists | Not readable by compliance/legal |
| Traditional audit logs | Who accessed what, when | Not decision-context-aware |
| **TrustLedger** | **Business-defensible decision record with evidence, policy, replay, tamper evidence** | **Purpose-built for AI decision audit** |

> Traditional monitoring tells you what happened technically. TrustLedger creates a business-readable record of why an AI decision can be defended.
