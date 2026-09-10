# Research Agent About Graph-Based Knowledge System for AI Agent

Local knowledge base for the TrustLedger Research Agent: how the agent's
graph-shaped evidence (entities, relationships, and supporting passages)
feeds the tamper-evident decision record.

## 1. What the knowledge graph is

The research agent does not reason over flat documents. It builds a small,
case-scoped knowledge graph per task:

- **Nodes** - entities the research question touches: clients, markets,
  competitors, regulations, policies, evidence sources, risk factors.
- **Edges** - typed relationships: `supports`, `contradicts`, `applies_to`,
  `cites`, `validates`, `supersedes`, `flags_risk`.
- **Passages** - the grounding text behind each node/edge: tariff orders,
  market outlooks, financial filings, methodology clauses.

Every node and edge carries provenance: source title, publisher, retrieval
time, and relevance to the research question. Nothing enters the graph
without a source.

## 2. How the agent uses it (per task)

1. **Retrieve** - gather engagement brief, market data, regulatory texts,
   and methodology clauses (`data_retrieved`, `policy_retrieved` events).
2. **Extract** - identify entities and candidate relationships from each
   source (`clause_identified` with a `policy_reference` payload).
3. **Link** - attach evidence nodes to the claims they support or
   contradict (`evidence_evaluated` with an `evidence` payload).
4. **Reason** - walk the graph: which claims have 3+ independent
   demand-side sources? Which lack a validated cost baseline? Conflicts
   become `supporting_factors` or escalation triggers.
5. **Decide** - emit `outcome`, `outcome_summary`, and
   `structured_rationale` (`primary_reason`, `supporting_factors`,
   `policy_basis`, `evidence_basis`, `exclusions_applied`).
6. **Seal** - `complete_decision` writes the Decision plus a SHA-256
   hash-chained AuditRecord. The graph's evidence/policy references are
   part of the sealed snapshot.

## 3. Graph-to-ledger mapping

| Graph concept | TrustLedger record |
|---|---|
| Evidence node | `evidence` row + `evidence_evaluated` event |
| Policy/methodology node | `policy_reference` + `policy_retrieved` / `clause_identified` event |
| Support/contradict edge | `supporting_factors`, `policy_basis`, `evidence_basis` in `structured_rationale` |
| Unresolved conflict | `requires_human_review=True`, status `review_required`, `human_review_triggered` event |
| Full traversal | `decision_events` ordered by `sequence` (Decision Trail / Replay) |

## 4. Integrity rules

- A task reaches `completed` / `review_required` only through
  `POST /complete`, which seals a Decision + AuditRecord (manual PATCH to
  terminal states is rejected with `TASK_NOT_SEALED`).
- Sealed tasks cannot be edited or deleted (`TASK_SEALED`).
- Verification recomputes the record hash and checks chain linkage
  (`GET /decisions/{task_id}/verify`, `GET /decisions/chain/verify`).
- One seeded record (`RES-2026-009999`) is deliberately tampered post-seal
  so the verify path can be demonstrated as failing.

## 5. Live runtime behavior

- Queue with `POST /decisions/queue`; the dispatcher (`agents/runtime.py`,
  2s tick) claims the oldest `queued` task and runs the registered
  `DiveAgent` for its domain (`ResearchAgent` for
  `deloitte_client_research`, `ComplianceBot` for `regulatory_compliance`).
- Each step emits `event_appended` + `status_changed` on the SSE hub
  (`GET /decisions/stream`); the Kanban patches cards within ~1-3s while
  the 30s poll stays as a resync fallback.
- Try: `python demo_live_run.py --sse-seconds 14` and watch
  http://localhost:3000 move Queued -> Running -> Completed.

## 6. Worked mini-example (EV charging)

Research question: should Tata Power enter commercial EV fast-charging in
Rajasthan in FY27?

- Nodes: Tata Power, Rajasthan market, BNEF Outlook 2026, tariff order,
  DEL-RM-2026 Sec 5.3, competitor cost baseline (conflicted).
- Edges: Outlook `supports` pilot entry; tariff order `validates` margin
  model; Sec 5.3 `applies_to` the entry test; conflicting baseline
  `contradicts` full-scale entry.
- Outcome: `recommended_with_caveats` (phased pilot) + `supporting_factors`
  citing the demand sources; the cost-baseline conflict is recorded in
  `exclusions_applied` rather than hidden.

## 7. Where to read more in this repo

- Agent contract: `backend/agents/base.py`; implementations:
  `backend/agents/research_agent.py`, `backend/agents/compliance_bot.py`
- Dispatch: `backend/agents/runtime.py`, `backend/agents/registry.py`
- Lifecycle: `backend/app/services/decision_ops.py`; sealing:
  `backend/app/services/sealer.py`; hashes:
  `backend/app/services/hash_chain.py`
- Live feed: `backend/app/services/event_hub.py`, `GET /decisions/stream`
- Product docs: `docs/02_Data_Driven_Design.md`,
  `docs/03_Agent_Based_Design.md`, `docs/05_Tech_Stack_and_Architecture.md`
