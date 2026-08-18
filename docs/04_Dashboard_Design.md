# TrustLedger — Dashboard Design

> **Purpose:** Design the main web interface for the TrustLedger prototype.  
> **Inspiration:** Modern AI-agent operational tools (task-centric visibility, status tracking) — **not** a copy of AI Agent Orchestrator.  
> **Core product:** Decision auditability and trust, with the Kanban dashboard as the **entry point**.

---

## Design Principles

1. **Business user first** — A compliance officer understands every screen without ML knowledge
2. **Task-centric** — User clicks a task to inspect its decision, not an agent to inspect its internals
3. **Progressive disclosure** — Dashboard shows summary; detail pages reveal depth
4. **Auditability over complexity** — Every element answers: understand, reconstruct, or verify?

---

## Information Architecture

```
Trust Dashboard
├── Agent Command Center (Kanban)     ← default landing page
├── Decision Overview                  ← click task card
│   ├── Summary tab (default)
│   ├── Decision Trail tab
│   ├── Decision Replay tab
│   └── Integrity tab
└── [Future: Settings, Agent Registry]
```

**Prototype Design Decision:** Single detail page with tabs rather than separate routes — faster to build, sufficient for demo.

---

## Screen 1: Agent Command Center (Kanban)

### Purpose
Answer: **"What is happening?"**

Operational entry point showing all agent tasks grouped by status. Inspired by agent orchestration dashboards but focused on **decision auditability**, not agent control.

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TrustLedger                                    ClaimsReviewAgent ● Active │
│  Agent Command Center                                                    │
├──────────┬──────────┬────────────────┬─────────────────────────────────┤
│  QUEUED  │ RUNNING  │ REVIEW REQUIRED│  COMPLETED                      │
│    (2)   │   (1)    │      (3)       │     (9)                         │
├──────────┼──────────┼────────────────┼─────────────────────────────────┤
│ ┌──────┐ │ ┌──────┐ │ ┌────────────┐ │ ┌──────┐                        │
│ │ Card │ │ │ Card │ │ │  Card ★    │ │ │ Card │                        │
│ └──────┘ │ └──────┘ │ └────────────┘ │ └──────┘                        │
│ ┌──────┐ │          │ ┌────────────┐ │ ┌──────┐                        │
│ │ Card │ │          │ │  Card      │ │ │ Card │                        │
│ └──────┘ │          │ └────────────┘ │ ...                             │
│          │          │ ┌────────────┐ │                                  │
│          │          │ │  Card      │ │                                  │
│          │          │ └────────────┘ │                                  │
└──────────┴──────────┴────────────────┴─────────────────────────────────┘
```

### Task Card Fields

Keep cards minimal — only what helps triage:

| Field | Example | Notes |
|-------|---------|-------|
| Case ID | `CLM-2026-004821` | Primary identifier |
| Case type | `Property Damage — Water` | Domain context |
| Agent | `ClaimsReviewAgent` | Which agent processed it |
| Decision | `Partial Approval` | Only shown if decision exists |
| Risk | `● High` | Color-coded: green/yellow/red |
| Duration | `45s` | Processing time |
| Review status | `Review Pending` badge | Only if human review triggered |

**Not on card:** raw inputs, evidence, hashes, technical metadata.

### Interactions

- Click card → navigate to Decision Overview
- Cards auto-refresh every 30s (or on agent completion in live demo)
- Column counts shown in headers
- **Prototype Design Decision:** No drag-and-drop between columns — status is agent-driven, not user-driven

### Visual Design Notes

- Clean, professional — think compliance tool, not hacker terminal
- Color palette: neutral grays + accent blue for TrustLedger branding
- Risk badges: green (low), amber (medium), red (high)
- Status columns: subtle background tints to differentiate

---

## Screen 2: Decision Overview

### Purpose
Answer: **"What decision was made?"**

### Layout — Summary Tab (default)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Command Center                                               │
│                                                                         │
│  CLM-2026-004821 — Property Damage (Water)                             │
│  Status: Review Required  │  Risk: ● High  │  Duration: 45s            │
│                                                                         │
│  ┌─ Tabs ──────────────────────────────────────────────────────────┐   │
│  │ [Summary]  [Decision Trail]  [Replay]  [Integrity]              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  DECISION                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ◆ Partial Approval                                             │   │
│  │  $12,400 of $18,000 claimed                                     │   │
│  │                                                                 │   │
│  │  Primary reason: Contents damage covered under Section 3.1;     │   │
│  │  structural damage excluded under Section 4.2.1 (external flood)│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  AGENT                          │  HUMAN REVIEW                        │
│  ClaimsReviewAgent v1.2.0       │  ⚠ Review Triggered                 │
│  insurance_claims               │  Reason: Claim > $10K partial       │
│                                 │  Status: Pending                     │
│                                                                         │
│  CASE INPUTS                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Claimant: Jane Doe          │  Amount: $18,000.00              │   │
│  │  Policy: POL-8842-C          │  Incident: 2026-07-14            │   │
│  │  Description: Basement flooding after heavy rainfall             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  EVIDENCE USED (3)              │  POLICIES REFERENCED (2)             │
│  ┌────────────────────────┐    │  ┌────────────────────────────┐      │
│  │ Adjuster Field Report  │    │  │ §4.2.1 Water Damage Excl.  │      │
│  │ Damage Photos (4)      │    │  │ §3.1 Contents Coverage   │      │
│  │ Weather Event Data     │    │  └────────────────────────────┘      │
│  └────────────────────────┘    │                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Sections

| Section | Content | Audience |
|---------|---------|----------|
| Decision | Outcome badge, summary, primary rationale | All users |
| Agent | Name, version, domain | All users |
| Human Review | Status, trigger reason | Compliance, operators |
| Case Inputs | Key fields from original submission | All users |
| Evidence Used | List with titles + summaries | Compliance, auditors |
| Policies Referenced | Section codes + titles | Compliance, legal |

---

## Screen 3: Decision Trail (Tab)

### Purpose
Answer: **"Why was it made?"**

### Layout — Chronological Timeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Decision Trail — CLM-2026-004821                                       │
│                                                                         │
│  ● 09:15:02  Case Received                                             │
│  │           Claim CLM-2026-004821 received for automated review        │
│  │                                                                      │
│  ● 09:15:05  Customer Data Retrieved                                   │
│  │           Policy and 3-year claim history retrieved                  │
│  │                                                                      │
│  ● 09:15:08  Policy Retrieved                                          │
│  │           Policy POL-8842-C coverage details loaded                   │
│  │                                                                      │
│  ● 09:15:15  Relevant Clause Identified                                │
│  │           Section 4.2.1 — Water Damage Exclusion                      │
│  │           ┌──────────────────────────────────────────────────┐     │
│  │           │ "Coverage excludes damage caused by flood..."      │     │
│  │           └──────────────────────────────────────────────────┘     │
│  │                                                                      │
│  ● 09:15:22  Evidence Evaluated                                        │
│  │           Adjuster report and photos evaluated                        │
│  │           ┌──────────────────────────────────────────────────┐     │
│  │           │ 📄 Adjuster Field Report                          │     │
│  │           │ 📷 Damage Photos (4 images)                       │     │
│  │           └──────────────────────────────────────────────────┘     │
│  │                                                                      │
│  ● 09:15:30  Evidence Evaluated                                        │
│  │           Weather data confirms heavy rainfall                        │
│  │           ┌──────────────────────────────────────────────────┐     │
│  │           │ 🌧 Weather Event Data — 62mm rainfall recorded   │     │
│  │           └──────────────────────────────────────────────────┘     │
│  │                                                                      │
│  ● 09:15:38  Decision Generated                                        │
│  │           Partial approval: $12,400 of $18,000                        │
│  │                                                                      │
│  ● 09:15:40  Human Review Triggered                                    │
│  │           High-value partial approval flagged                         │
│  │                                                                      │
│  ● 09:15:47  Record Sealed                                             │
│              Decision record sealed and hash-chained                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Timeline Design Rules

- Vertical timeline, oldest at top
- Each node: timestamp, event type label, summary text
- Evidence and policy references expand inline below relevant nodes
- Final node (Record Sealed) uses distinct styling (lock icon)
- No technical IDs visible — use human-readable labels

---

## Screen 4: Decision Replay (Tab)

### Purpose
Answer: **"Can we reconstruct it?"**

### Layout — Step-by-Step Walkthrough

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Decision Replay — CLM-2026-004821                                      │
│                                                                         │
│  Reconstruct the decision as it happened, using the stored audit record.│
│  No agent re-execution — read-only replay from captured data.            │
│                                                                         │
│  Step 3 of 7                                    [ ◀ Prev ] [ Next ▶ ]  │
│  ━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  STEP 3: Relevant Clause Identified                             │   │
│  │  2026-08-10 09:15:15                                           │   │
│  │                                                                 │   │
│  │  The agent identified Section 4.2.1 — Water Damage Exclusion    │   │
│  │  as applicable to this claim.                                   │   │
│  │                                                                 │   │
│  │  Policy: POL-8842-C                                            │   │
│  │  ┌───────────────────────────────────────────────────────┐     │   │
│  │  │ Section 4.2.1 — Water Damage Exclusion               │     │   │
│  │  │ "Coverage excludes damage caused by flood, surface     │     │   │
│  │  │  water, or water below the surface of the ground,      │     │   │
│  │  │  unless caused by a burst pipe or plumbing failure     │     │   │
│  │  │  within the insured structure."                        │     │   │
│  │  │                                                        │     │   │
│  │  │ Applied: External rainfall flooding is excluded.       │     │   │
│  │  └───────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [ ◀ Previous: Policy Retrieved ]    [ Next: Evidence Evaluated ▶ ]  │
│                                                                         │
│  ── Final Decision Preview ──                                          │
│  Partial Approval: $12,400 of $18,000                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Replay Behavior

- Step-through navigation (prev/next buttons + progress bar)
- Each step shows: title, timestamp, description, linked evidence/policies
- Final step shows complete decision with full rationale
- "Auto-play" button steps through all events with 2s delay (demo mode)
- Replay data from `GET /decisions/{id}/replay` — no backend computation

---

## Screen 5: Integrity View (Tab)

### Purpose
Answer: **"Can we verify the record wasn't altered?"**

Designed for **non-technical compliance users** — no cryptography jargon.

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Integrity Verification — CLM-2026-004821                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │            ✅  Record Verified                                  │   │
│  │                                                                 │   │
│  │   This decision record has not been altered since it was        │   │
│  │   sealed on August 10, 2026 at 09:15:47 UTC.                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  RECORD DETAILS                                                         │
│  ┌────────────────────────┬────────────────────────────────────────┐ │
│  │ Sealed at              │ 2026-08-10 09:15:47 UTC               │ │
│  │ Chain position         │ Record #42 of 42                        │ │
│  │ Status                 │ ✅ Intact                               │ │
│  └────────────────────────┴────────────────────────────────────────┘ │
│                                                                         │
│  CHAIN OF CUSTODY                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Record #41  ────  Record #42 (this record)                    │   │
│  │  ✅ Verified        ✅ Verified                                 │   │
│  │                                                                 │   │
│  │  Each record is cryptographically linked to the one before it.  │   │
│  │  If any record is changed after sealing, the chain breaks and   │   │
│  │  verification fails.                                            │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TECHNICAL DETAILS (expandable)                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Record hash:    e3b0c442...b855                                 │   │
│  │  Previous hash:  a7f3e8d2...8877                                 │   │
│  │  Algorithm:      SHA-256                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [ Verify Now ]  ← re-runs verification live                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tamper Demo Mode (Should Have)

For demo impact, include one pre-tampered record that shows:

```
┌─────────────────────────────────────────────────────────────────┐
│            ❌  Record Verification Failed                        │
│                                                                 │
│   This record may have been altered after sealing.              │
│   The stored fingerprint does not match the record content.     │
└─────────────────────────────────────────────────────────────────┘
```

**Prototype Design Decision:** Pre-seed one tampered record for demo contrast. Do not tamper live during presentation.

### Integrity UI Rules

- Default view: plain-language pass/fail with green/red indicator
- "Chain of custody" visual: simple linked boxes, not a blockchain diagram
- Technical hash values hidden behind "Technical Details" expandable section
- "Verify Now" button re-calls `GET /decisions/{id}/verify` for live confirmation

---

## Responsive / Accessibility Notes

- Desktop-first (demo will be on laptop/projector)
- Minimum width: 1024px
- Timeline and replay usable at 1280×720 (common projector resolution)
- Color not sole indicator — use icons + text labels alongside color

---

## Component Map (Implementation Reference)

| UI Component | Data source | Notes |
|-------------|-------------|-------|
| KanbanBoard | `GET /decisions?` grouped by status | 4 columns |
| TaskCard | Decision list item | Click → detail |
| DecisionSummary | `GET /decisions/{id}` | Overview tab |
| DecisionTimeline | `GET /decisions/{id}` → events[] | Trail tab |
| ReplayViewer | `GET /decisions/{id}/replay` | Replay tab |
| IntegrityPanel | `GET /decisions/{id}/verify` | Integrity tab |
| RiskBadge | task.risk_level | Shared component |
| OutcomeBadge | decision.outcome | Color-coded |

---

## What This Dashboard Is NOT

- Not an agent configuration panel
- Not a prompt editor
- Not a model performance monitor
- Not a workflow automation builder
- Not a general-purpose BI dashboard

It is a **decision audit and trust interface** that happens to use agent/task visibility as its entry point.
