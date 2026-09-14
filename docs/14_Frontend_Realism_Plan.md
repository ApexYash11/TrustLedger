# Frontend Realism Plan — Make TrustLedger feel Deloitte-grade

## Goal
Non-technical reviewer understands any AI recommendation in <2 min, with no “demo-UI” tells.

## Principles
- Fewer words, more hierarchy (title > outcome > why). Every card/page answers 3 questions: What was asked? What was decided? Can I trust it?
- Every state exists: empty, loading, running, sealed, tampered — no dead “No evidence” walls.
- Deloitte palette: stone + one accent (emerald for verified, amber/red for risk), consistent density.

## Parcels (parallel, no dependencies)

### P1 — Board realism (1 day)
- Remove remaining noise: column count is the only metric; drop `+` affordances — creation only via top `Add Task` + prompt `Run`.
- Cards: risk stripe (low=stone, medium=amber, high=red left border), duration as `22s`, agent avatar initials, truncated 2-line summary only.
- Empty columns show *example* ghost card (“Eg. Market entry — EV Charging → Recommended with caveats”) so board never feels blank on first load.
- Prompt bar: single input `Ask a research question…` — streaming drawer underneath shows thinking tokens + `Sealed ✓` check, then auto-inserts card via SSE (already does).

### P2 — Decision record as a deliverable (1 day)
- Replace black `Recommendation` block with white Deloitte-style memo header: `To / Subject / Date / Risk` table + outcome pill.
- Keep `DecisionGraph` as hero (already added), then collapse `What was asked` to 2 rows (Question + Case type). Hide `Client` if duplicate.
- Merge `Evidence` + `Methodology` into one `Sources & Methodology` table with inline citations `[EV-1]` linked to graph nodes on hover.
- Timing/Agent footer: single line `ResearchAgent · deloitte_client_research · v1.3.0 · 14 Sep 2026 10:19` — remove separate cards.

### P3 — Trust signals (0.5 day)
- Integrity: default `Verified` green check at top of Summary (not hidden in tab). `Integrity` tab becomes `Verify & Export` with SHA + chain position + `Copy hash` + `Export PDF` (client-side print).
- Tampered demo `RES-2026-009999`: red banner in Summary + Graph broken edge (dashed red line) — immediate story.

### P4 — Polish & perf (0.5 day)
- Typography: `Inter` for UI, `Source Serif` for recommendation prose — one size down (13px → 12.5px) for density.
- Loading: skeleton graph (3 nodes pulsing) instead of “No decision yet”.
- A11y: focus ring, keyboard `Tab` through table, `aria-live` for stream.
- Lighthouse target: Performance 95, A11y 100.

## Execution order (parallel crews)
- Crew A: P1 (board)
- Crew B: P2 (record)
- Merge both → P3 → P4. No blockers — graph component already isolated.
