# TrustLedger — Data-Driven Design

> **Purpose:** Define what information must be captured while an agent makes a decision so it can later be explained, replayed, and verified.

---

## Design Principle

> Capture **auditable decision events, evidence, policy references, structured rationale, inputs, outputs, and metadata** — never private LLM chain-of-thought.

---

## Entity Model

For the prototype, we use a **hybrid model**: normalized tables for query/dashboard needs, with a JSONB `record_snapshot` on seal for replay integrity.

```
Agent ──< Task ──< DecisionEvent
                  ├── Evidence (linked)
                  ├── PolicyReference (linked)
                  └── Decision (1:1, created on complete)
                        └── AuditRecord (1:1, sealed + hash-chained)
```

### Why this structure?

| Entity | Separate table? | Reason |
|--------|----------------|--------|
| Agent | Yes | Reused across tasks; shown on dashboard |
| Task | Yes | Kanban queries by status; primary UI object |
| DecisionEvent | Yes | Timeline ordering; append-only during decision |
| Evidence | Yes (or embedded in events) | Linked from multiple events; shown in detail view |
| PolicyReference | Yes (or embedded) | Reusable policy catalog + per-decision links |
| Decision | Yes | Final outcome separate from in-progress task |
| AuditRecord / HashChain | Yes | Integrity verification queries |

**Prototype Design Decision:** For speed, Evidence and PolicyReference can be stored as JSONB arrays on the task/decision record rather than separate normalized tables. The logical model below remains the contract.

---

## Entity Definitions

### Agent

Represents the AI system executing decisions.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `agent_id` | Yes | UUID | Registration | Identity |
| `name` | Yes | string | Registration | Dashboard display |
| `version` | Yes | string | Registration | Audit: which model/version decided |
| `domain` | Yes | string | Registration | Filter (e.g., `insurance_claims`) |
| `description` | No | string | Registration | Context for reviewers |

### Task

A unit of agent work — maps to one Kanban card.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `task_id` | Yes | UUID | `POST /decisions/start` | Primary key |
| `case_id` | Yes | string | Start | Business reference (e.g., `CLM-2026-004821`) |
| `case_type` | Yes | string | Start | Dashboard label (e.g., `Property Damage Claim`) |
| `agent_id` | Yes | UUID | Start | Which agent owns this |
| `status` | Yes | enum | Start + updates | Kanban column: `queued`, `running`, `review_required`, `completed`, `disputed` |
| `risk_level` | No | enum | During/complete | `low`, `medium`, `high` — set when evaluable |
| `inputs` | Yes | JSONB | Start | Original case data submitted to agent |
| `created_at` | Yes | timestamp | Start | Audit |
| `started_at` | No | timestamp | First event | Duration tracking |
| `completed_at` | No | timestamp | Complete | Duration tracking |
| `human_review_status` | No | enum | During/complete | `not_required`, `triggered`, `approved`, `rejected` |

**Compliance-visible:** case_id, case_type, status, risk_level, inputs (redacted PII if needed), human_review_status  
**Technical metadata:** agent_id, timestamps, internal UUIDs

### DecisionEvent

Append-only chronological log of what happened during the decision.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `event_id` | Yes | UUID | Each POST | Identity |
| `task_id` | Yes | UUID | Each POST | Parent link |
| `sequence` | Yes | integer | Each POST | Ordering for timeline/replay |
| `event_type` | Yes | enum | Each POST | See event types below |
| `timestamp` | Yes | timestamp | Each POST | Timeline display |
| `summary` | Yes | string | Each POST | Human-readable one-liner for compliance UI |
| `details` | No | JSONB | Each POST | Structured payload (evidence refs, policy refs, evaluation results) |
| `actor` | Yes | enum | Each POST | `agent`, `system`, `human_reviewer` |

**Event types:**

| Type | When logged | Example summary |
|------|-------------|-----------------|
| `case_received` | Start | "Claim CLM-2026-004821 received for review" |
| `data_retrieved` | Agent fetches data | "Customer policy and claim history retrieved" |
| `policy_retrieved` | Agent loads policy | "Policy POL-8842-C retrieved" |
| `clause_identified` | Agent matches rules | "Section 4.2.1 — Water damage exclusion identified" |
| `evidence_evaluated` | Agent assesses evidence | "Photos and adjuster report evaluated" |
| `decision_generated` | Agent produces outcome | "Recommendation: Partial approval — $12,400 of $18,000" |
| `human_review_triggered` | Escalation | "High-value claim flagged for human review" |
| `human_review_completed` | Reviewer acts | "Reviewer approved agent recommendation" |
| `record_sealed` | Complete | "Decision record sealed and hash-chained" |

**Compliance-visible:** sequence, event_type, timestamp, summary, details (business fields only)  
**Technical metadata:** event_id, internal references

### Evidence

Data or documents the agent retrieved and considered.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `evidence_id` | Yes | UUID | Event with evidence | Link from timeline |
| `task_id` | Yes | UUID | Event | Parent |
| `evidence_type` | Yes | enum | Event | `document`, `photo`, `database_record`, `third_party_report` |
| `title` | Yes | string | Event | Display: "Adjuster Field Report" |
| `source` | Yes | string | Event | Where it came from: "Claims Management System" |
| `content_summary` | Yes | string | Event | Plain-language summary (not raw file) |
| `content_ref` | No | string | Event | URI/ID to source system (not fetched in prototype) |
| `retrieved_at` | Yes | timestamp | Event | Audit |
| `relevance` | No | string | Event | Why this evidence mattered |

**Compliance-visible:** all fields except content_ref  
**Technical metadata:** content_ref (internal system pointer)

### PolicyReference

Rules, clauses, or regulations applied during the decision.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `policy_id` | Yes | UUID | Event | Identity |
| `task_id` | Yes | UUID | Event | Parent |
| `policy_code` | Yes | string | Event | "POL-8842-C" |
| `section` | Yes | string | Event | "Section 4.2.1" |
| `title` | Yes | string | Event | "Water Damage Exclusion" |
| `text_excerpt` | Yes | string | Event | Relevant clause text |
| `application` | Yes | string | Event | How it was applied: "Excluded basement flooding not caused by pipe burst" |

**Compliance-visible:** all fields

### Decision

Final outcome — created on `POST /decisions/{id}/complete`.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `decision_id` | Yes | UUID | Complete | Identity |
| `task_id` | Yes | UUID | Complete | Parent |
| `outcome` | Yes | enum | Complete | `approved`, `partially_approved`, `denied`, `escalated` |
| `outcome_summary` | Yes | string | Complete | "Partial approval: $12,400 of $18,000 claimed" |
| `structured_rationale` | Yes | JSONB | Complete | Business-readable reasoning (see below) |
| `alternatives_considered` | No | JSONB | Complete | What other outcomes were evaluated |
| `confidence_score` | No | float | Complete | Agent confidence (0–1), optional |
| `decided_at` | Yes | timestamp | Complete | Audit |

**Structured rationale schema (required fields):**

```json
{
  "primary_reason": "string — main reason in plain language",
  "supporting_factors": ["string array"],
  "policy_basis": ["policy_id references"],
  "evidence_basis": ["evidence_id references"],
  "exclusions_applied": ["string array — what was excluded and why"]
}
```

**Compliance-visible:** outcome, outcome_summary, structured_rationale, alternatives_considered  
**Technical metadata:** confidence_score

### AuditRecord

Sealed, immutable snapshot with hash chain entry.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `audit_id` | Yes | UUID | Complete | Identity |
| `task_id` | Yes | UUID | Complete | Parent |
| `record_hash` | Yes | string (SHA-256) | Complete | Tamper evidence for this record |
| `previous_hash` | Yes | string | Complete | Link to prior record in chain (`GENESIS` for first) |
| `record_snapshot` | Yes | JSONB | Complete | Full decision record at seal time |
| `sealed_at` | Yes | timestamp | Complete | When record became immutable |
| `chain_sequence` | Yes | integer | Complete | Global chain position |

---

## Hash Chain — Conceptual Model

```
Record 0:  hash_0 = SHA-256(canonical_json_snapshot_0 + "GENESIS")
Record 1:  hash_1 = SHA-256(canonical_json_snapshot_1 + hash_0)
Record 2:  hash_2 = SHA-256(canonical_json_snapshot_2 + hash_1)
...
```

**Verification:** Recompute hash from stored snapshot + previous_hash; compare to stored record_hash. Walk entire chain to confirm linkage.

**Prototype scope:** Hash chain stored in PostgreSQL. Production would add enterprise key management and WORM storage.

**Canonical JSON:** Keys sorted alphabetically, no whitespace, UTF-8 — ensures deterministic hashing.

---

## Capture Timeline

| Phase | API call | Data captured |
|-------|----------|---------------|
| **Start** | `POST /decisions/start` | Task created: case_id, case_type, agent_id, inputs, status=`running` |
| **During** | `POST /decisions/{id}/events` (multiple) | DecisionEvents, Evidence, PolicyReferences appended |
| **Complete** | `POST /decisions/{id}/complete` | Decision outcome, structured_rationale, status=`completed` or `review_required` |
| **Seal** | Automatic on complete | AuditRecord created, hash computed and chained, status final |

---

## How a Decision Is Reconstructed (Replay)

1. Fetch task + all decision events ordered by `sequence`
2. Fetch linked evidence and policy references
3. Fetch decision outcome + structured_rationale
4. Fetch audit record for integrity context
5. Present as ordered steps: each event → summary + linked evidence/policies → final decision

Replay uses **stored data only** — no re-invocation of the agent or LLM.

---

## Data Visibility Matrix

| Data | Compliance user | AI engineer | Stored | Displayed |
|------|----------------|-------------|--------|-----------|
| Case inputs | Yes (redacted) | Yes | Yes | Yes |
| Decision outcome | Yes | Yes | Yes | Yes |
| Structured rationale | Yes | Yes | Yes | Yes |
| Evidence summaries | Yes | Yes | Yes | Yes |
| Policy excerpts | Yes | Yes | Yes | Yes |
| Decision events | Yes | Yes | Yes | Yes |
| Hash / integrity | Yes (simplified) | Yes | Yes | Yes |
| Agent version | Yes | Yes | Yes | Yes |
| LLM chain-of-thought | **No** | **No** | **No** | **No** |
| Raw prompts | No | Optional | No | No |
| Model embeddings | No | No | No | No |

---

## Example: Complete TrustLedger Decision Record (JSON)

Synthetic insurance claim — high-risk partial approval scenario.

```json
{
  "task": {
    "task_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "case_id": "CLM-2026-004821",
    "case_type": "Property Damage — Water",
    "agent_id": "agent-claims-v1",
    "status": "review_required",
    "risk_level": "high",
    "human_review_status": "triggered",
    "inputs": {
      "claimant_name": "Jane Doe",
      "policy_number": "POL-8842-C",
      "claim_amount": 18000.00,
      "incident_date": "2026-07-14",
      "incident_description": "Basement flooding after heavy rainfall; furniture and flooring damaged",
      "property_address": "42 Oak Lane, Jaipur, RJ"
    },
    "created_at": "2026-08-10T09:15:00Z",
    "started_at": "2026-08-10T09:15:02Z",
    "completed_at": "2026-08-10T09:15:47Z"
  },
  "agent": {
    "agent_id": "agent-claims-v1",
    "name": "ClaimsReviewAgent",
    "version": "1.2.0",
    "domain": "insurance_claims"
  },
  "events": [
    {
      "sequence": 1,
      "event_type": "case_received",
      "timestamp": "2026-08-10T09:15:02Z",
      "summary": "Claim CLM-2026-004821 received for automated review",
      "actor": "system"
    },
    {
      "sequence": 2,
      "event_type": "data_retrieved",
      "timestamp": "2026-08-10T09:15:05Z",
      "summary": "Customer policy and 3-year claim history retrieved",
      "actor": "agent",
      "details": { "policy_status": "active", "prior_claims_count": 1 }
    },
    {
      "sequence": 3,
      "event_type": "policy_retrieved",
      "timestamp": "2026-08-10T09:15:08Z",
      "summary": "Policy POL-8842-C coverage details loaded",
      "actor": "agent"
    },
    {
      "sequence": 4,
      "event_type": "clause_identified",
      "timestamp": "2026-08-10T09:15:15Z",
      "summary": "Section 4.2.1 — Water Damage Exclusion identified as applicable",
      "actor": "agent",
      "details": { "policy_ref": "pol-ref-001" }
    },
    {
      "sequence": 5,
      "event_type": "evidence_evaluated",
      "timestamp": "2026-08-10T09:15:22Z",
      "summary": "Adjuster report and photos evaluated — no evidence of pipe burst",
      "actor": "agent",
      "details": { "evidence_refs": ["ev-001", "ev-002"] }
    },
    {
      "sequence": 6,
      "event_type": "evidence_evaluated",
      "timestamp": "2026-08-10T09:15:30Z",
      "summary": "Weather data confirms heavy rainfall on incident date",
      "actor": "agent",
      "details": { "evidence_refs": ["ev-003"] }
    },
    {
      "sequence": 7,
      "event_type": "decision_generated",
      "timestamp": "2026-08-10T09:15:38Z",
      "summary": "Recommendation: Partial approval — $12,400 of $18,000 claimed",
      "actor": "agent"
    },
    {
      "sequence": 8,
      "event_type": "human_review_triggered",
      "timestamp": "2026-08-10T09:15:40Z",
      "summary": "High-value partial approval flagged for human review",
      "actor": "system",
      "details": { "trigger_reason": "Claim amount > $10,000 with partial approval" }
    },
    {
      "sequence": 9,
      "event_type": "record_sealed",
      "timestamp": "2026-08-10T09:15:47Z",
      "summary": "Decision record sealed and hash-chained",
      "actor": "system"
    }
  ],
  "evidence": [
    {
      "evidence_id": "ev-001",
      "evidence_type": "third_party_report",
      "title": "Adjuster Field Report",
      "source": "Claims Management System",
      "content_summary": "Field adjuster noted water damage to basement flooring and furniture. No visible pipe damage. Damage consistent with external water entry.",
      "retrieved_at": "2026-08-10T09:15:20Z",
      "relevance": "Determines cause of water damage — external vs. plumbing"
    },
    {
      "evidence_id": "ev-002",
      "evidence_type": "photo",
      "title": "Damage Photos (4 images)",
      "source": "Claimant Upload Portal",
      "content_summary": "Photos show flooded basement, wet furniture, damaged laminate flooring. No visible pipe fixtures in damaged area.",
      "retrieved_at": "2026-08-10T09:15:21Z",
      "relevance": "Visual confirmation of damage extent and cause indicators"
    },
    {
      "evidence_id": "ev-003",
      "evidence_type": "database_record",
      "title": "Weather Event Data",
      "source": "National Weather Service API",
      "content_summary": "Heavy rainfall recorded on 2026-07-14: 62mm in 24 hours. Flood watch was in effect for the area.",
      "retrieved_at": "2026-08-10T09:15:28Z",
      "relevance": "Corroborates claimant's account of rainfall-induced flooding"
    }
  ],
  "policy_references": [
    {
      "policy_id": "pol-ref-001",
      "policy_code": "POL-8842-C",
      "section": "Section 4.2.1",
      "title": "Water Damage Exclusion",
      "text_excerpt": "Coverage excludes damage caused by flood, surface water, or water below the surface of the ground, unless caused by a burst pipe or plumbing failure within the insured structure.",
      "application": "External rainfall flooding is excluded. However, Section 3.1 covers contents damage separately up to $15,000 regardless of cause."
    },
    {
      "policy_id": "pol-ref-002",
      "policy_code": "POL-8842-C",
      "section": "Section 3.1",
      "title": "Personal Contents Coverage",
      "text_excerpt": "Personal contents coverage up to $15,000 for damage to furniture, electronics, and personal items, subject to standard deductibles.",
      "application": "Contents damage of $12,400 (furniture + electronics) is covered under this section."
    }
  ],
  "decision": {
    "decision_id": "dec-004821",
    "outcome": "partially_approved",
    "outcome_summary": "Partial approval: $12,400 of $18,000 claimed. Structural/flooring damage ($5,600) excluded under Section 4.2.1. Contents ($12,400) approved under Section 3.1.",
    "structured_rationale": {
      "primary_reason": "Contents damage is covered under Section 3.1, but structural flooring damage falls under the water damage exclusion in Section 4.2.1 because the flooding was caused by external rainfall, not a pipe burst.",
      "supporting_factors": [
        "Adjuster report found no evidence of pipe burst or plumbing failure",
        "Weather data confirms heavy rainfall on incident date",
        "Photos consistent with external water entry, not plumbing damage"
      ],
      "policy_basis": ["pol-ref-001", "pol-ref-002"],
      "evidence_basis": ["ev-001", "ev-002", "ev-003"],
      "exclusions_applied": [
        "Section 4.2.1: Structural/flooring damage ($5,600) excluded — external flood water"
      ]
    },
    "alternatives_considered": [
      { "outcome": "full_denial", "reason_rejected": "Contents coverage (Section 3.1) applies regardless of water damage cause" },
      { "outcome": "full_approval", "reason_rejected": "Section 4.2.1 excludes structural damage from external flooding" }
    ],
    "confidence_score": 0.87,
    "decided_at": "2026-08-10T09:15:38Z"
  },
  "audit_record": {
    "audit_id": "aud-004821",
    "record_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "previous_hash": "a7f3e8d2c1b0945f6e7d8c9b0a1f2e3d4c5b6a79887766554433221100998877",
    "chain_sequence": 42,
    "sealed_at": "2026-08-10T09:15:47Z"
  }
}
```

*Note: `record_hash` above is illustrative. Production seed data will contain real computed hashes.*

---

## Database Tables (Prototype)

```sql
-- Simplified prototype schema
agents (agent_id, name, version, domain, description)
tasks (task_id, case_id, case_type, agent_id, status, risk_level,
       inputs, human_review_status, created_at, started_at, completed_at)
decision_events (event_id, task_id, sequence, event_type, timestamp,
                 summary, details, actor)
decisions (decision_id, task_id, outcome, outcome_summary,
           structured_rationale, alternatives_considered, confidence_score, decided_at)
audit_records (audit_id, task_id, record_hash, previous_hash,
               record_snapshot, sealed_at, chain_sequence)
```

Evidence and policy references stored in `decision_events.details` and/or `decisions.structured_rationale` for prototype speed. Normalized tables added if time permits in Week 4.
