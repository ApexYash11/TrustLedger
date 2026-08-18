# TrustLedger — Demo / Showcase Flow

> **Duration:** 3–5 minutes  
> **Audience:** Deloitte Capstone evaluators (technical and business)  
> **Goal:** Tell a story that demonstrates auditability, replay, and tamper evidence — not a feature tour.

---

## Demo Narrative Arc

**Setup:** "Imagine you're a compliance officer at an insurance company. AI agents are processing hundreds of claims daily. A customer disputes a partial approval. Today, this takes days to investigate. With TrustLedger, it takes two minutes."

---

## Pre-Demo Checklist

- [ ] Backend running with seeded data (15+ records across all Kanban columns)
- [ ] Frontend loaded at `http://localhost:3000`
- [ ] All seed records pass integrity verification
- [ ] One tampered record pre-seeded (CLM-2026-009999) for contrast demo
- [ ] Browser zoom at 100%, no unrelated tabs open
- [ ] Demo claim (CLM-2026-004821) is in **Review Required** column

---

## Step-by-Step Demo Script

### Step 1 — Agent Command Center (30 seconds)

**Screen:** Kanban dashboard (landing page)

**Action:** Open TrustLedger dashboard. Point to Kanban columns.

**Say:**
> "This is TrustLedger's Agent Command Center — where we see what our AI agents are currently doing. We have claims moving through four stages: queued, running, review required, and completed. TrustLedger doesn't make decisions — it records and verifies them."

**Point out:**
- Multiple tasks across columns (shows system is active)
- Task cards show case ID, decision, risk level
- 3 tasks in "Review Required" — these need human attention

**Do NOT:** Explain Kanban mechanics or agent orchestration. Frame it as an audit entry point.

---

### Step 2 — Open a High-Risk Task (20 seconds)

**Screen:** Click task card `CLM-2026-004821` in **Review Required**

**Action:** Click the high-risk partial approval claim.

**Say:**
> "Let's look at this one — a property damage claim flagged for review. The agent recommended a partial approval: $12,400 of $18,000. A customer or regulator might ask: why wasn't the full amount approved?"

**Point out:**
- Status: Review Required
- Risk: High
- Human review was triggered because it's a high-value partial approval

---

### Step 3 — Show the Decision (30 seconds)

**Screen:** Decision Overview → Summary tab

**Action:** Walk through the summary sections top to bottom.

**Say:**
> "Here's the decision at a glance. Partial approval — $12,400 approved, $5,600 excluded. The primary reason is right here in plain language: contents damage is covered, but structural flooring damage is excluded because the flooding was from external rainfall, not a pipe burst."

**Point out:**
- Decision outcome badge (Partial Approval)
- Structured rationale — readable by a compliance officer, no ML jargon
- Case inputs: claimant, amount, incident description
- Evidence used: 3 items
- Policies referenced: 2 sections

**Do NOT:** Mention model confidence scores or technical metadata unless asked.

---

### Step 4 — Open the Decision Trail (45 seconds)

**Screen:** Click **Decision Trail** tab

**Action:** Scroll through the timeline slowly, pausing at key events.

**Say:**
> "This is the full decision trail — every step the agent took, captured live as the decision happened. Not reconstructed after the fact."

**Pause at key events:**

1. **Case Received** — "The claim entered the system."
2. **Policy Retrieved** — "The agent pulled the customer's policy."
3. **Clause Identified** — "It found Section 4.2.1 — the water damage exclusion. You can see the actual policy text right here."
4. **Evidence Evaluated** — "It reviewed the adjuster report, photos, and weather data. Each piece of evidence is linked."
5. **Decision Generated** — "Based on all of this, the agent recommended partial approval."
6. **Human Review Triggered** — "Because this is a high-value partial approval, it was flagged for human review."
7. **Record Sealed** — "The record was sealed and locked into the audit chain."

**Say:**
> "Every step is timestamped and linked to the evidence and policies that drove it. This is what a compliance officer or auditor needs — not model internals, but a defensible decision record."

---

### Step 5 — Show Evidence and Policy References (30 seconds)

**Screen:** Still on Decision Trail, or scroll to Evidence/Policies sections on Summary tab

**Action:** Expand one evidence item and one policy reference.

**Say:**
> "The adjuster report noted no pipe damage — consistent with external flooding. The weather data confirms 62 millimeters of rainfall on the incident date. And here's the exact policy clause that was applied — Section 4.2.1 excludes external flood damage, but Section 3.1 separately covers contents."

**Point out:**
- Evidence is summarized in plain language (not raw documents)
- Policy text is quoted directly (auditable)
- Application field explains HOW the policy was applied to THIS case

---

### Step 6 — Demonstrate Decision Replay (30 seconds)

**Screen:** Click **Replay** tab

**Action:** Click "Next" through 2–3 steps, then hit "Auto-play" or jump to final step.

**Say:**
> "Decision Replay lets anyone reconstruct the decision step by step — like watching a recording, but built from the stored audit record. No agent re-execution, no re-running the model. This is read-only reconstruction from captured data."

**Action:** Step to the final decision step.

**Say:**
> "And here's the final decision with the full rationale — exactly as it was captured at decision time."

---

### Step 7 — Show Hash / Integrity Verification (45 seconds)

**Screen:** Click **Integrity** tab

**Action:** Show the green verification status.

**Say:**
> "This is what makes TrustLedger different from a spreadsheet or a regular log file. Every decision record is cryptographically sealed and linked to the previous record in a hash chain. This proves nothing was altered after the decision was made."

**Point out:**
- Green "Record Verified" status
- Sealed timestamp
- Chain position (Record #42 of 42)
- Chain of custody visual (linked to previous record)

**Action:** Click "Verify Now" to re-run live.

**Say:**
> "We can re-verify at any time. The hash is recomputed from the stored data and compared to the sealed fingerprint."

**Optional — Tamper contrast (if time):**
> "And here's what happens if someone tries to alter a record after the fact."

Navigate to tampered record `CLM-2026-009999` → Integrity tab shows red "Verification Failed."

---

### Step 8 — Business Value Close (30 seconds)

**Screen:** Return to Command Center or stay on Integrity tab

**Say:**
> "So what's the business value? Today, investigating a disputed AI decision takes days — manually pulling logs, interviewing engineers, reconstructing what happened. TrustLedger reduces that to a two-minute lookup: open the case, read the trail, replay the decision, verify the record hasn't been tampered with."

> "The same schema works across insurance, banking, healthcare, and government — only the policy references change. TrustLedger wraps around existing agents via a simple API — five endpoints, no agent rebuild required."

> "We're not building another monitoring dashboard. We're building the trust layer that lets organizations deploy AI agents in high-stakes workflows with confidence."

---

## Timing Summary

| Step | Duration | Cumulative |
|------|----------|------------|
| 1. Command Center | 30s | 0:30 |
| 2. Open high-risk task | 20s | 0:50 |
| 3. Show decision | 30s | 1:20 |
| 4. Decision trail | 45s | 2:05 |
| 5. Evidence & policies | 30s | 2:35 |
| 6. Decision replay | 30s | 3:05 |
| 7. Integrity verification | 45s | 3:50 |
| 8. Business value close | 30s | 4:20 |
| **Total** | | **~4:20** |

Buffer: 40 seconds for transitions and questions.

---

## Demo Dataset Requirements

The seed data must include:

| Record | Status | Risk | Purpose in demo |
|--------|--------|------|-----------------|
| CLM-2026-004821 | review_required | high | **Primary demo claim** — partial approval |
| CLM-2026-004822 | completed | low | Shows a clean approval |
| CLM-2026-004823 | completed | medium | Shows a denial |
| CLM-2026-004824 | running | — | Shows live agent activity |
| CLM-2026-004825 | queued | — | Shows pipeline |
| CLM-2026-009999 | completed | high | **Tampered record** — integrity fail demo |
| + 9 more | various | various | Fill Kanban columns realistically |

---

## Fallback Plans

| Problem | Fallback |
|---------|----------|
| Backend not running | Pre-loaded static JSON in frontend (read-only demo mode) |
| Integrity check fails on primary record | Use CLM-2026-004822 (known-good) instead |
| Agent not generating live tasks | All tasks pre-seeded; mention "in production, these appear live" |
| Projector resolution too low | Zoom browser to 125%; collapse sidebar |
| Question about LLM internals | "TrustLedger captures the decision record, not model internals — that's by design for compliance readability" |

---

## Key Phrases to Use

- "Captured live, not reconstructed after the fact"
- "Business-readable, not data-science jargon"
- "Tamper-evident audit trail"
- "Two-minute lookup, not a three-day investigation"
- "Wraps around existing agents — no rebuild required"
- "The agent decides; TrustLedger records and verifies"

## Key Phrases to Avoid

- "Our AI model predicted..."
- "The LLM chain-of-thought shows..."
- "SHAP values indicate..."
- "Our orchestration platform..."
- "Blockchain-secured..."
- "Production-ready enterprise platform..."
