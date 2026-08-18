# TrustLedger — Product Requirements Document (PRD)

> **Version:** 0.1 (Prototype)  
> **Source of truth:** Deloitte Capstone EOI — `TrustLedger_EOI_Enhanced.pptx`  
> **Target:** Minimal convincing prototype for Capstone 2026 evaluation (~4 weeks)

---

## Product Overview

**TrustLedger: Enterprise AI Decision Audit & Trust Layer** is a system that wraps around existing AI agents to create a standardized, tamper-evident decision record for every high-stakes automated decision.

TrustLedger does **not** make business decisions. It **observes, records, structures, and verifies** the decision process so that compliance officers, auditors, and legal reviewers can understand, reconstruct, and defend AI-driven outcomes — without data-science expertise.

For the prototype, TrustLedger demonstrates this capability through a web-based **Agent Command Center** (Kanban dashboard) backed by a logging API, hash-chained audit store, and decision replay — using a simulated insurance claims agent and synthetic data.

---

## Problem

### What is happening today?

AI agents increasingly make high-stakes decisions: approving or denying insurance claims, loan applications, medical prior authorizations, hiring recommendations, and government benefit determinations. These decisions affect real people and carry regulatory weight.

Yet when a decision is questioned, organizations face a critical gap: **no standardized record exists that explains what data drove the decision and what alternatives were considered.** Investigation requires manually piecing together application logs, database queries, model outputs, and email threads — a process that takes days and produces inconsistent results.

### Why are AI decisions difficult to defend?

1. **No live capture** — Records are reconstructed after the fact, introducing gaps and bias
2. **Technical logs ≠ business records** — Debug traces don't map to compliance requirements
3. **Fragmented tooling** — Each team logs differently; no cross-domain standard
4. **Explainability mismatch** — Model explainability tools (SHAP, LIME) serve data scientists, not compliance officers
5. **No tamper evidence** — Reconstructed records can be challenged as incomplete or altered

### Who suffers?

| Persona | Pain |
|---------|------|
| **Compliance officer** | Cannot verify AI decisions meet regulatory requirements |
| **Auditor** | Cannot reconstruct decision logic from available records |
| **Legal / risk reviewer** | Cannot defend decisions in disputes or regulatory inquiries |
| **Business operator** | Cannot quickly resolve customer complaints about AI decisions |
| **AI / engineering team** | Spends disproportionate time on ad-hoc investigation support |

### What happens if unsolved?

- **Regulatory exposure** from indefensible AI decisions
- **Slow, costly manual dispute reconstruction** (multi-day investigations per case)
- **No standard record format** across business units
- **AI confined to low-stakes work** — only ~11% of orgs have agents in production vs. ~38% piloting; trust gaps are a primary blocker
- Emerging rules (adverse-action disclosure, claims-denial rationale) remain unaddressed

*Aligned with Deloitte EOI problem statement.*

---

## Target Users

### Primary (prototype demo personas)

| User | Goal | Technical level |
|------|------|-----------------|
| **Compliance officer** | Verify AI decisions meet policy and regulation | Domain expert, not technical |
| **Auditor** | Reconstruct and validate decision trail | Domain expert, not technical |
| **Legal / risk reviewer** | Assess defensibility of a disputed decision | Domain expert, not technical |

### Secondary

| User | Goal | Technical level |
|------|------|-----------------|
| **Business operator** | Resolve customer disputes quickly | Domain expert |
| **AI engineer** | Integrate TrustLedger without rebuilding agent | Technical |

**Design constraint:** Dashboard and decision records must be comprehensible without knowledge of LLM internals, embeddings, vector databases, or prompt engineering.

---

## User Stories

### Must address in prototype

| ID | Story | Acceptance |
|----|-------|------------|
| US-1 | As a **compliance officer**, I want to inspect why an AI agent made a high-stakes decision, so I can verify it meets policy. | Decision detail shows outcome, rationale, evidence, and policy references in plain language |
| US-2 | As an **auditor**, I want to reconstruct the decision from original evidence, so I can validate the process. | Decision Replay walks through chronological steps with linked evidence |
| US-3 | As a **reviewer**, I want to verify the decision record has not been modified, so I can trust the audit trail. | Integrity view shows hash chain verification with pass/fail status |
| US-4 | As an **AI engineer**, I want to integrate TrustLedger via API without rebuilding my agent, so adoption is low-friction. | Agent calls 3 endpoints (start, events, complete) and records appear on dashboard |
| US-5 | As a **business operator**, I want to see all active agent tasks at a glance, so I know what needs attention. | Kanban dashboard shows tasks by status with risk indicators |

---

## Core User Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Agent executes claim review (simulated)                           │
│  2. TrustLedger captures decision events live via Logging API           │
│  3. Decision record created and hash-chained                            │
│  4. Task appears on Agent Command Center (Kanban)                       │
│  5. User opens task → Decision Overview                                 │
│  6. User inspects Decision Trail (timeline + evidence + policies)       │
│  7. User runs Decision Replay (step-by-step reconstruction)           │
│  8. User verifies Integrity (hash chain check → tamper-evident proof)  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Questions answered at each step:**

| Step | Question |
|------|----------|
| Dashboard | What is happening? |
| Decision Overview | What decision was made? |
| Decision Trail | Why was it made? |
| Decision Replay | Can we reconstruct it? |
| Integrity View | Can we verify it wasn't altered? |

---

## Functional Requirements

### Must Have (MVP)

| ID | Requirement |
|----|-------------|
| FR-1 | Logging API: start decision, append events, complete/seal decision |
| FR-2 | Store decision record with inputs, outputs, evidence, policy refs, events, rationale |
| FR-3 | SHA-256 hash chain linking sealed decision records |
| FR-4 | Integrity verification endpoint and UI (pass/fail + chain details) |
| FR-5 | Kanban dashboard with columns: Queued, Running, Review Required, Completed |
| FR-6 | Task cards showing: task ID, case type, agent, decision, risk, duration |
| FR-7 | Decision detail page: overview, evidence, policies, trail, replay, integrity |
| FR-8 | Decision Trail: chronological visual timeline of decision events |
| FR-9 | Decision Replay: step-by-step reconstruction from stored record |
| FR-10 | Simulated insurance claims agent that logs to TrustLedger |
| FR-11 | Pre-seeded synthetic demo dataset (10–20 records across all statuses) |
| FR-12 | Do NOT store or display LLM chain-of-thought; use structured rationale only |

### Should Have

| ID | Requirement |
|----|-------------|
| FR-13 | Risk level indicator (Low / Medium / High) on task cards |
| FR-14 | Human review status field (triggered / approved / rejected / N/A) |
| FR-15 | Filter/search decisions by case ID, status, or risk level |
| FR-16 | "Disputed" status or flag for demo narrative |
| FR-17 | Processing time display on task detail |
| FR-18 | Optional LLM-powered agent (vs. fully scripted simulation) |

### Nice to Have

| ID | Requirement |
|----|-------------|
| FR-19 | Side-by-side comparison of two decisions |
| FR-20 | Export decision record as JSON/PDF |
| FR-21 | Tamper demo mode (show verification fail after manual DB edit) |
| FR-22 | Simple analytics: decisions per day, avg review time |

---

## KPIs

Aligned with EOI target metrics, adapted for prototype demonstration:

| KPI | Target | How measured in prototype |
|-----|--------|--------------------------|
| **Decision reconstruction time** | < 2 minutes | Timed demo: open disputed claim → full replay in under 2 min |
| **Tamper-evidence** | 100% of sealed records verifiable | Integrity check returns pass for all seed data; fail demo on tampered record |
| **User comprehension** | ≥ 90% compliance staff understand record without DS help | Informal test with 1–2 non-technical reviewers during Week 4 |
| **Investigation effort reduction** | Multi-day → minutes (qualitative) | Demo narrative: "This used to take 3 days of manual log reconstruction" |

Do not claim production ROI figures in the prototype demo unless clearly labeled as projected.

---

## MVP Definition

The prototype MVP is **complete** when all of the following are true:

- [ ] Simulated insurance claims agent creates decisions via TrustLedger API
- [ ] At least 10 pre-seeded decision records visible on Kanban dashboard
- [ ] User can click any task and see full decision detail
- [ ] Decision Trail shows chronological events with evidence and policy links
- [ ] Decision Replay reconstructs the decision step-by-step
- [ ] Integrity verification confirms hash chain for every sealed record
- [ ] 3–5 minute demo script runs end-to-end without manual backend steps
- [ ] No chain-of-thought exposed; only structured auditable fields shown
- [ ] Evaluator understands: agent decides → TrustLedger records → human audits

---

## Prototype Design Decisions (not in EOI)

| Decision | Rationale |
|----------|-----------|
| Kanban Agent Command Center as primary UI | Operational visibility inspired by agent orchestration tools; audit layer remains core product |
| 4-week timeline (not 12-week EOI plan) | Team deadline: second week of September 2026 |
| Insurance claims only (not lending) | EOI allows either; claims maps well to denial-rationale regulations |
| PostgreSQL-only search (no OpenSearch) | Sufficient for demo scale; reduces infra complexity |
| Single-page detail with tabs | Faster to build than multi-page flow in 4 weeks |

---

## Out of Scope

See `08_Scope_and_Non_Goals.md` for full list. Summary: no production auth, RBAC, real PII, enterprise integrations, multi-agent orchestration, or regulatory certification.
