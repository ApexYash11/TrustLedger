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
| `domain` | Yes | string | Registration | Filter (e.g., `deloitte_client_research`) |
| `description` | No | string | Registration | Context for reviewers |

### Task

A unit of agent work — maps to one Kanban card.

| Field | Required | Type | Captured when | Why |
|-------|----------|------|---------------|-----|
| `task_id` | Yes | UUID | `POST /decisions/start` | Primary key |
| `case_id` | Yes | string | Start | Business reference (e.g., `RES-2026-004821`) |
| `case_type` | Yes | string | Start | Dashboard label (e.g., `Market Entry Assessment`) |
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
| `case_received` | Start | "Research task RES-2026-004821 received for processing" |
| `data_retrieved` | Agent fetches data | "Client engagement brief and data retrieved" |
| `policy_retrieved` | Agent loads policy | "Policy POL-8842-C retrieved" |
| `clause_identified` | Agent matches rules | "Section 4.2.1 — Water damage exclusion identified" |
| `evidence_evaluated` | Agent assesses evidence | "Photos and adjuster report evaluated" |
| `decision_generated` | Agent produces outcome | "Recommendation: Partial approval — $12,400 of $18,000" |
| `human_review_triggered` | Escalation | "High-risk engagement flagged for human review" |
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
| `source` | Yes | string | Event | Where it came from: "Engagement Data Room" |
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
| `outcome_summary` | Yes | string | Complete | "Conditional recommendation: phased pilot; cost baseline unresolved" |
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

Synthetic research engagement — high-risk conditional recommendation (Tata Power EV market entry).

```json
{
  "task": {
    "task_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "case_id": "RES-2026-004821",
    "case_type": "Market Entry Assessment — EV Charging",
    "agent_id": "agent-research-v1",
    "status": "review_required",
    "risk_level": "high",
    "human_review_status": "triggered",
    "inputs": {
      "client_name": "Tata Power",
      "engagement_code": "ENG-2026-TP-018",
      "research_question": "Should Tata Power enter the commercial EV fast-charging market in Rajasthan?",
      "review_deadline": "2026-08-28"
    },
    "created_at": "2026-08-10T09:15:00Z",
    "started_at": "2026-08-10T09:15:02Z",
    "completed_at": "2026-08-10T09:15:47Z"
  },
  "agent": {
    "agent_id": "agent-research-v1",
    "name": "ResearchAgent",
    "version": "1.2.0",
    "domain": "deloitte_client_research"
  },
  "events": [
    {
      "sequence": 1,
      "event_type": "case_received",
      "timestamp": "2026-08-10T09:15:02Z",
      "summary": "Research task RES-2026-004821 received for automated processing",
      "actor": "system"
    },
    {
      "sequence": 2,
      "event_type": "data_retrieved",
      "timestamp": "2026-08-10T09:15:05Z",
      "summary": "Client engagement brief and market data retrieved",
      "actor": "agent",
      "details": { "engagement_status": "active", "prior_studies": 1 }
    },
    {
      "sequence": 3,
      "event_type": "policy_retrieved",
      "timestamp": "2026-08-10T09:15:08Z",
      "summary": "Deloitte Research Methodology DEL-RM-2026 loaded",
      "actor": "agent"
    },
    {
      "sequence": 4,
      "event_type": "clause_identified",
      "timestamp": "2026-08-10T09:15:15Z",
      "summary": "Methodology Section 5.3 — Market Entry Evidence Thresholds identified as applicable",
      "actor": "agent",
      "details": { "policy_ref": "pol-ref-001" }
    },
    {
      "sequence": 5,
      "event_type": "evidence_evaluated",
      "timestamp": "2026-08-10T09:15:22Z",
      "summary": "Third-party market outlook evaluated",
      "actor": "agent",
      "details": { "evidence_refs": ["ev-001", "ev-002"] }
    },
    {
      "sequence": 6,
      "event_type": "evidence_evaluated",
      "timestamp": "2026-08-10T09:15:30Z",
      "summary": "Competitor cost baseline reviewed — conflicting figures found",
      "actor": "agent",
      "details": { "evidence_refs": ["ev-003"] }
    },
    {
      "sequence": 7,
      "event_type": "decision_generated",
      "timestamp": "2026-08-10T09:15:38Z",
      "summary": "Recommendation: Conditional — phased pilot; full-scale deferred pending cost verification",
      "actor": "agent"
    },
    {
      "sequence": 8,
      "event_type": "human_review_triggered",
      "timestamp": "2026-08-10T09:15:40Z",
      "summary": "Competitor cost baseline fails Section 5.3 validation threshold flagged for partner review",
      "actor": "system",
      "details": { "trigger_reason": "Methodology Section 5.3 evidence threshold unmet" }
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
      "title": "EV Charging Infrastructure Outlook 2026",
      "source": "BloombergNEF (licensed)",
      "content_summary": "Forecasts 34% CAGR for commercial fast-charging demand in western India through FY30.",
      "retrieved_at": "2026-08-10T09:15:20Z",
      "relevance": "Primary demand-side source for the pilot-scale estimate"
    },
    {
      "evidence_id": "ev-002",
      "evidence_type": "document",
      "title": "Competitor Benchmark Set (4 operators)",
      "source": "Client Data Room",
      "content_summary": "Per-kWh prices across the four benchmarked operators vary by 22% between the two compiled sources; two figures could not be reconciled.",
      "retrieved_at": "2026-08-10T09:15:29Z",
      "relevance": "Competitor cost baseline fails the Section 5.3 validation threshold"
    },
    {
      "evidence_id": "ev-003",
      "evidence_type": "database_record",
      "title": "Rajasthan EV Policy 2024 and Tariff Orders",
      "source": "State Electricity Regulatory Commission Portal",
      "content_summary": "Per-kWh charging tariff capped at ₹1.10; charging stations classified as a licensed activity with simplified approvals.",
      "retrieved_at": "2026-08-10T09:15:28Z",
      "relevance": "Establishes the regulatory cost base for the charging-margin model"
    }
  ],
  "policy_references": [
    {
      "policy_id": "pol-ref-001",
      "policy_code": "DEL-RM-2026",
      "section": "Section 5.3",
      "title": "Market Entry Evidence Thresholds",
      "text_excerpt": "A market entry recommendation requires three independent demand-side sources and a validated competitor cost baseline; otherwise the engagement must be escalated for partner review.",
      "application": "Three demand-side sources are available, but the competitor cost baseline has conflicting figures — full-scale entry cannot be recommended yet."
    },
    {
      "policy_id": "pol-ref-002",
      "policy_code": "DEL-RM-2026",
      "section": "Section 2.4",
      "title": "Independence and Conflicts Check",
      "text_excerpt": "Research engagements must be screened against the firm conflict register before fieldwork and again before the recommendation is issued.",
      "application": "No conflict found: the firm has no concurrent engagement with competing charging-infrastructure operators."
    }
  ],
  "decision": {
    "decision_id": "dec-004821",
    "outcome": "recommended_with_caveats",
    "outcome_summary": "Conditional recommendation: enter via a phased pilot in the Jaipur–Udaipur corridor. Demand-side evidence supports pilot scale, but the competitor cost baseline is contested — full-scale entry is deferred pending verification (Methodology Section 5.3).",
    "structured_rationale": {
      "primary_reason": "Demand-side sources triangulate to a viable pilot scale, but the competitor cost baseline fails the validation threshold in Section 5.3, so a full-scale entry recommendation cannot be defended yet.",
      "supporting_factors": [
        "Three independent demand-side sources agree on pilot-scale volumes",
        "State tariff cap and simplified licensing improve unit economics",
        "Competitor price figures vary by 22% across sources and remain unreconciled"
      ],
      "policy_basis": ["pol-ref-001", "pol-ref-002"],
      "evidence_basis": ["ev-001", "ev-002", "ev-003"],
      "exclusions_applied": [
        "Section 5.3: Full-scale entry deferred — competitor cost baseline unverified"
      ]
    },
    "alternatives_considered": [
      { "outcome": "recommended", "reason_rejected": "Recommending full-scale entry on an unverified cost baseline breaches Section 5.3" },
      { "outcome": "not_recommended", "reason_rejected": "Demand-side evidence is strong; declining the pilot ignores a validated opportunity" }
    ],
    "confidence_score": 0.81,
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
