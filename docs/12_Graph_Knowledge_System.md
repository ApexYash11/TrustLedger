# Evidence Graph — What Ships, and What Does Not

How the research agent's grounding facts (sources and methodology clauses)
attach to a decision, and how they are rendered.

> **Scope note.** An earlier draft of this document described a general
> knowledge-graph engine: node and edge tables, seven typed relationships,
> passage-level provenance, and a traversal that counted independent sources.
> **None of that was built.** This version describes what the code actually
> does. Section 6 lists the gap, deliberately, so the claim and the
> implementation cannot drift apart again.

## 1. What actually exists

Each decision carries two kinds of grounding fact:

- **Sources** (`evidence`) — what the agent cited: title, source, type, a
  content summary, and why it was relevant.
- **Standards** (`policy_references`) — the methodology clauses applied:
  code, section, title, an excerpt, and how it was applied.

Both are written into the `details` JSON of a `decision_event` as it happens,
and read back at query time by
`extract_evidence_and_policies()` in `backend/app/services/sealer.py`.

There is **no node table, no edge table, and no traversal**. The "graph" is a
one-hop provenance structure — question → facts → outcome — which is all the
data supports.

## 2. Storage shape

| Concept | Where it actually lives |
|---|---|
| Source | `decision_events.details.evidence` on an `evidence_evaluated` event |
| Standard | `decision_events.details.policy_reference` on a `policy_retrieved` / `clause_identified` event |
| Relationship | Implicit in the event type; rendered as `supports` / `applies_to` |
| Reasoning | `decisions.structured_rationale` (`primary_reason`, `supporting_factors`, `policy_basis`, `evidence_basis`, `exclusions_applied`) |
| Ordering | `decision_events.sequence` — the Decision Trail and Replay tabs |

`evidence_id` values (`ev-001`, …) are generated positionally at read time.
They are **not stable identifiers** and must not be used as foreign keys.

## 3. How it is rendered

`frontend/src/components/DecisionGraph.tsx` draws client → question → facts →
recommendation as a single SVG with a computed layout. Blue edges are sources
(`supports`), amber are standards (`applies_to`).

Two constraints worth knowing:

- Node positions and edge endpoints derive from the same numbers, inside one
  `viewBox`. An earlier version mixed HTML nodes at fixed pixel offsets with a
  stretched SVG, so edges drifted from their boxes as the viewport changed.
- The diagram caps at 4 sources and 3 standards for legibility. Full text lives
  in the Sources / Standards cards directly beneath it, since SVG cannot wrap
  text.

When a record has no research question, the question node renders red and says
so rather than falling back to the case ID — a record where the agent answered
something nobody asked is exactly the failure the UI should surface.

## 4. Where the facts come from — read this before demoing

**Sources are asserted by the model, not retrieved.** Nothing is fetched. There
is no URL, no document store, and no check that a cited document exists or says
what the citation claims. With `OPENROUTER_API_KEY` set, the model is asked for
`evidence_details` and `policy_details` and whatever it returns is recorded.
With no key, the deterministic template in
`backend/agents/research_agent.py` supplies fixed placeholder facts.

This matters for how the project is described. TrustLedger's claim is
**"whatever the agent cited, this proves what it cited and that the record has
not changed since"** — not "these citations are real."

## 5. Integrity rules

- A task reaches `completed` / `review_required` only through
  `complete_decision`, which always seals a `Decision` + `AuditRecord`.
  A manual status PATCH to a terminal state is rejected with `TASK_NOT_SEALED`.
- Sealed tasks cannot be edited or deleted (`TASK_SEALED`). The board reflects
  this: sealed cards are not draggable and offer no status actions.
- Verification recomputes the record hash and checks chain linkage
  (`GET /decisions/{task_id}/verify`, `GET /decisions/chain/verify`).
- One seeded record (`RES-2026-009999`) is deliberately tampered post-seal so
  the failing verify path can be demonstrated.

## 6. Not built (and honest about it)

| Claimed in the earlier draft | Status |
|---|---|
| Node / edge tables | Not built. Facts live in event JSON. |
| Seven typed edges (`contradicts`, `cites`, `validates`, `supersedes`, `flags_risk`) | Not built. Only `supports` / `applies_to` are rendered, derived from event type. |
| Passage-level provenance | Not built. A source has a title and a summary, no passage anchor. |
| Graph traversal ("which claims have 3+ independent sources") | Not built. No query walks the facts. |
| Retrieval of real documents | Not built. See section 4. |

These are the honest next steps if the graph is to become real: persist nodes
and typed edges at seal time, then make the diagram and a traversal read from
them rather than from event JSON.

## 7. Live runtime behaviour

- `POST /api/v1/research/stream` runs a question end to end and streams
  progress. The run executes in a background task, so a browser navigating
  away mid-run still seals the record, and a wall-clock budget
  (`TRUSTLEDGER_RUN_BUDGET`, default 75s) guarantees it never hangs.
- `POST /decisions/queue` puts a task in the `queued` lane; the dispatcher
  (`agents/runtime.py`, `TRUSTLEDGER_POLL` tick) claims it and runs the
  registered `DiveAgent` for its domain.
- Both paths emit `status_changed` / `event_appended` on the SSE hub
  (`GET /decisions/stream`), so the board updates live.

## 8. Where to read more

- Agent contract: `backend/agents/base.py`; implementations:
  `backend/agents/research_agent.py`, `backend/agents/compliance_bot.py`
- Dispatch: `backend/agents/runtime.py`, `backend/agents/registry.py`
- Lifecycle: `backend/app/services/decision_ops.py`; sealing:
  `backend/app/services/sealer.py`; hashing:
  `backend/app/services/hash_chain.py`
- Live feed: `backend/app/services/event_hub.py`
- Rendering: `frontend/src/components/DecisionGraph.tsx`,
  `frontend/src/lib/vocab.ts`
