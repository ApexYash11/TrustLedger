# TrustLedger — Agent-Based Design

> **Core principle:** TrustLedger does NOT make the business decision. It observes, records, structures, and verifies the decision process.

---

## Interaction Model

```
┌──────────────┐
│  User / Case │  Submits claim, loan app, etc.
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   AI Agent   │  Makes the business decision
└──────┬───────┘
       │ calls Logging API at each step
       ▼
┌──────────────────────┐
│ TrustLedger Logging  │  Captures events, evidence, policies
│       Layer          │
└──────┬───────────────┘
       │
       ▼
┌──────────────┐
│  Decision    │  Structured, hash-chained record
│   Record     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Trust     │  Kanban dashboard, trail, replay,
│  Dashboard   │  integrity verification
└──────────────┘
```

---

## Lifecycle Definitions

### Agent Lifecycle

| State | Description |
|-------|-------------|
| `registered` | Agent known to TrustLedger (name, version, domain) |
| `active` | Agent available to process tasks |
| `idle` | No tasks currently running (dashboard display only) |

The prototype uses one pre-registered agent: **ClaimsReviewAgent v1.2.0**.

### Task Lifecycle

| State | Trigger | Dashboard column |
|-------|---------|-----------------|
| `queued` | Task submitted, not yet picked up | Queued |
| `running` | `POST /decisions/start` called | Running |
| `review_required` | Agent completes but human review triggered | Review Required |
| `completed` | Decision sealed, no review needed (or review done) | Completed |
| `disputed` | Manual flag for demo narrative | Review Required (with badge) |

**Prototype Design Decision:** `disputed` is a visual flag, not a separate workflow engine state.

### Logging Lifecycle

```
start ──→ event ──→ event ──→ ... ──→ event ──→ complete ──→ seal
  │          │                         │            │          │
  │          └── append-only ──────────┘            │          │
  │                                                 │          │
  └── task created, status=running                  │          │
                                                    │          │
                              decision + rationale recorded    │
                                                    │          │
                              audit record created, hash chained
```

Events are **append-only** during a decision. No updates or deletes. Corrections require a new event with `event_type: correction` (not needed for MVP).

### Decision Capture

On `POST /decisions/{id}/complete`, the agent provides:

- Final outcome (`approved`, `partially_approved`, `denied`, `escalated`)
- Outcome summary (plain language)
- Structured rationale (required fields per data model)
- Optional: alternatives considered, confidence score

TrustLedger validates required fields, creates the Decision record, and triggers sealing.

### Evidence Capture

Evidence is logged as part of decision events:

```json
POST /decisions/{id}/events
{
  "event_type": "evidence_evaluated",
  "summary": "Adjuster report and photos evaluated",
  "details": {
    "evidence": {
      "evidence_type": "third_party_report",
      "title": "Adjuster Field Report",
      "source": "Claims Management System",
      "content_summary": "Field adjuster noted water damage...",
      "relevance": "Determines cause of water damage"
    }
  }
}
```

Evidence can also be pre-registered in a separate call if retrieved before evaluation.

### Policy / Context Capture

Policy references are logged similarly:

```json
POST /decisions/{id}/events
{
  "event_type": "clause_identified",
  "summary": "Section 4.2.1 — Water Damage Exclusion identified",
  "details": {
    "policy_reference": {
      "policy_code": "POL-8842-C",
      "section": "Section 4.2.1",
      "title": "Water Damage Exclusion",
      "text_excerpt": "Coverage excludes damage caused by flood...",
      "application": "External rainfall flooding is excluded"
    }
  }
}
```

### Human Review

When the agent or system determines human review is needed:

```json
POST /decisions/{id}/events
{
  "event_type": "human_review_triggered",
  "summary": "High-value partial approval flagged for human review",
  "actor": "system",
  "details": { "trigger_reason": "Claim amount > $10,000 with partial approval" }
}
```

Task status updates to `review_required`. Reviewer action logged as `human_review_completed` event (manual in prototype).

### Audit Record Sealing

Automatic on complete:

1. Assemble full record snapshot (task + events + evidence + policies + decision)
2. Fetch `previous_hash` from latest audit record (or `GENESIS`)
3. Compute `record_hash = SHA-256(canonical_json(snapshot) + previous_hash)`
4. Store audit record with chain_sequence
5. Log `record_sealed` event

After sealing, the record is **immutable** in the prototype (enforced by application logic, not DB triggers).

### Hash-Chain Generation

See `02_Data_Driven_Design.md` for algorithm. The agent does not participate in hashing — TrustLedger backend handles it entirely on seal.

### Decision Replay

`GET /decisions/{id}/replay` returns:

```json
{
  "task_id": "...",
  "case_id": "CLM-2026-004821",
  "replay_steps": [
    {
      "step": 1,
      "timestamp": "...",
      "title": "Case Received",
      "description": "Claim CLM-2026-004821 received for automated review",
      "evidence": [],
      "policies": []
    },
    {
      "step": 2,
      "timestamp": "...",
      "title": "Evidence Evaluated",
      "description": "Adjuster report and photos evaluated",
      "evidence": [{ "title": "Adjuster Field Report", "summary": "..." }],
      "policies": []
    }
  ],
  "final_decision": {
    "outcome": "partially_approved",
    "summary": "Partial approval: $12,400 of $18,000",
    "rationale": { "primary_reason": "..." }
  },
  "integrity": {
    "record_hash": "...",
    "verified": true
  }
}
```

Replay is **read-only reconstruction** from stored data. No agent re-execution.

---

## API Contract (Prototype)

Base URL: `http://localhost:8000/api/v1`

All responses include standard error format:
```json
{ "error": "message", "code": "ERROR_CODE" }
```

### Register Agent (setup, not per-decision)

```
POST /agents
```

```json
{
  "name": "ClaimsReviewAgent",
  "version": "1.2.0",
  "domain": "insurance_claims",
  "description": "Automated insurance claims review agent"
}
```

Response: `{ "agent_id": "uuid" }`

---

### Start Decision

```
POST /decisions/start
```

Request:
```json
{
  "agent_id": "uuid",
  "case_id": "CLM-2026-004821",
  "case_type": "Property Damage — Water",
  "inputs": {
    "claimant_name": "Jane Doe",
    "policy_number": "POL-8842-C",
    "claim_amount": 18000.00,
    "incident_date": "2026-07-14",
    "incident_description": "Basement flooding after heavy rainfall"
  }
}
```

Response:
```json
{
  "task_id": "uuid",
  "status": "running",
  "created_at": "2026-08-10T09:15:00Z"
}
```

Side effects: Task created, initial `case_received` event logged.

---

### Append Event

```
POST /decisions/{task_id}/events
```

Request:
```json
{
  "event_type": "evidence_evaluated",
  "summary": "Adjuster report and photos evaluated — no pipe burst evidence",
  "actor": "agent",
  "details": {
    "evidence": {
      "evidence_type": "third_party_report",
      "title": "Adjuster Field Report",
      "source": "Claims Management System",
      "content_summary": "Field adjuster noted water damage to basement flooring",
      "relevance": "Determines cause of water damage"
    }
  }
}
```

Response:
```json
{
  "event_id": "uuid",
  "sequence": 5,
  "timestamp": "2026-08-10T09:15:22Z"
}
```

Side effects: Event appended with auto-incremented sequence. Evidence/policy extracted from details if present.

---

### Complete Decision

```
POST /decisions/{task_id}/complete
```

Request:
```json
{
  "outcome": "partially_approved",
  "outcome_summary": "Partial approval: $12,400 of $18,000 claimed",
  "structured_rationale": {
    "primary_reason": "Contents covered under Section 3.1; structural damage excluded under Section 4.2.1",
    "supporting_factors": ["No pipe burst evidence", "Weather data confirms rainfall"],
    "policy_basis": ["pol-ref-001", "pol-ref-002"],
    "evidence_basis": ["ev-001", "ev-002", "ev-003"],
    "exclusions_applied": ["Section 4.2.1: Structural damage excluded"]
  },
  "alternatives_considered": [
    { "outcome": "full_denial", "reason_rejected": "Contents coverage applies regardless" }
  ],
  "confidence_score": 0.87,
  "requires_human_review": true
}
```

Response:
```json
{
  "decision_id": "uuid",
  "task_id": "uuid",
  "status": "review_required",
  "audit_record": {
    "audit_id": "uuid",
    "record_hash": "sha256...",
    "chain_sequence": 42,
    "sealed_at": "2026-08-10T09:15:47Z"
  }
}
```

Side effects: Decision created, audit record sealed and hash-chained, task status updated.

---

### Get Decision

```
GET /decisions/{task_id}
```

Response: Full decision record (same structure as example JSON in `02_Data_Driven_Design.md`).

---

### List Decisions (Dashboard)

```
GET /decisions?status=running&risk_level=high
```

Response:
```json
{
  "decisions": [
    {
      "task_id": "uuid",
      "case_id": "CLM-2026-004821",
      "case_type": "Property Damage — Water",
      "agent_name": "ClaimsReviewAgent",
      "status": "review_required",
      "risk_level": "high",
      "outcome": "partially_approved",
      "outcome_summary": "Partial approval: $12,400 of $18,000",
      "duration_seconds": 45,
      "human_review_status": "triggered",
      "created_at": "2026-08-10T09:15:00Z"
    }
  ],
  "total": 15
}
```

---

### Replay Decision

```
GET /decisions/{task_id}/replay
```

Response: See Decision Replay section above.

---

### Verify Integrity

```
GET /decisions/{task_id}/verify
```

Response:
```json
{
  "task_id": "uuid",
  "verified": true,
  "record_hash": "sha256...",
  "previous_hash": "sha256...",
  "chain_sequence": 42,
  "sealed_at": "2026-08-10T09:15:47Z",
  "chain_status": "intact",
  "message": "Record hash matches computed hash. Chain linkage verified."
}
```

On tamper:
```json
{
  "verified": false,
  "chain_status": "broken",
  "message": "Record hash mismatch — data may have been altered after sealing."
}
```

---

### Verify Full Chain (optional demo endpoint)

```
GET /audit/chain/verify
```

Response:
```json
{
  "total_records": 42,
  "verified": true,
  "broken_at_sequence": null,
  "message": "All 42 records in chain verified."
}
```

---

## How an Existing Agent Integrates

An existing agent needs **three integration points** — no rebuild required:

```python
# Pseudocode — agent integration pattern

# 1. Start
task = trustledger.start_decision(
    agent_id=AGENT_ID,
    case_id=case.id,
    case_type="Property Damage",
    inputs=case.to_dict()
)

# 2. Log events as agent works
trustledger.log_event(task.id, "data_retrieved",
    summary="Policy and claim history retrieved", actor="agent")

trustledger.log_event(task.id, "evidence_evaluated",
    summary="Adjuster report evaluated", actor="agent",
    details={"evidence": {...}})

trustledger.log_event(task.id, "clause_identified",
    summary="Section 4.2.1 identified", actor="agent",
    details={"policy_reference": {...}})

# 3. Complete
trustledger.complete_decision(
    task.id,
    outcome="partially_approved",
    outcome_summary="Partial approval: $12,400 of $18,000",
    structured_rationale={...},
    requires_human_review=True
)
```

**Integration effort:** ~50 lines of wrapper code. Agent logic unchanged.

---

## Simulated Agent (Prototype)

The prototype includes `agents/claims_agent.py` — a scripted agent that:

1. Reads synthetic claim cases from a JSON seed file
2. Calls TrustLedger API at each step (with realistic delays)
3. Produces varied outcomes: approved, partially approved, denied
4. Triggers human review for high-value or high-risk cases

**Prototype Design Decision:** LLM API integration is optional. The scripted agent is sufficient for demo reliability. An LLM-powered variant can replace the rationale generation in Week 4 if time permits.

### Agent script flow (per claim)

```
1. start_decision(case)
2. log: data_retrieved
3. log: policy_retrieved
4. log: clause_identified (1–2 policies)
5. log: evidence_evaluated (2–3 evidence items)
6. log: decision_generated
7. [optional] log: human_review_triggered
8. complete_decision(outcome, rationale)
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Event on non-existent task | 404 |
| Event on sealed/completed task | 409 Conflict — "Decision already sealed" |
| Complete without required rationale | 400 Validation error |
| Duplicate case_id (same agent) | 409 — or allow with warning (prototype: allow) |
| Agent not registered | 404 |

---

## Security Notes (Prototype)

- No authentication on API endpoints (prototype only)
- CORS open for local development
- Production would add: API keys, RBAC, encryption at rest/transit, PII redaction

See `08_Scope_and_Non_Goals.md`.
