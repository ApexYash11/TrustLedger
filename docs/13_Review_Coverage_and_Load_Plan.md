# Review Coverage + Dashboard Load Plan

## Context
- ~100 review findings exist (CodeRabbit + GitGuardian + manual), 10 skipped as non-blocking.
- Dashboard shows blank loading state then populates — perceived latency high despite SSE.

## A. Get the skipped 10 reviewed (and prevent future skips)

| # | Action | Owner | Effort | Done when |
|---|--------|-------|--------|-----------|
| 1 | Inventory skipped 10: export CodeRabbit `codereview.json` + GitGuardian incident 36592553, tag each `skip-reason: risk-accepted / false-positive / deferred` | Lead | 1h | List published in `docs/reviews/skipped.md` |
| 2 | Turn 6 true-positives into issues (assign, label `P1/P2`) — e.g. `N+1 list query`, `missing index on Task.created_at`, `no rate-limit on /research/stream` | Lead | 30m | 6 issues opened |
| 3 | Require checks on PR: `pytest`, `next build`, `gitleaks`, `CodeRabbit` — branch protection on `main` | DevOps | 1h | `main` blocks merge if any fails |
| 4 | Add ` .coderabbit.yaml` with `path_instructions` for `agents/**` and `frontend/src/**` to force review depth | Dev | 30m | Config in repo |
| 5 | Pre-commit hook: `ggshield + eslint --max-warnings=0` — catches secrets/style before push | Dev | 30m | `pre-commit install` documented |

## B. Cut dashboard load from ~2s to <400ms perceived

Root causes today: `GET /decisions` joins Agent + Decision per row (N+1), no pagination, `GET /decisions/{id}` waits for full snapshot, no skeleton, 10s poll despite SSE.

| # | Fix | Impact |
|---|-----|--------|
| 1 | Backend: single query with `joinedload` + `limit 50` + cursor pagination; add DB index `tasks(created_at)`, `audit_records(chain_sequence)` | TTFB 900ms → 120ms |
| 2 | Frontend: replace blank `Loading…` with `SkeletonCard` shimmer per column (4× skeletons) + `Suspense` | Perceived load instant |
| 3 | Prefetch: Kanban `hover` prefetches `GET /decisions/{id}` into `react-query` cache; detail opens from cache | Detail open <80ms |
| 4 | SSE only: remove 10s poll, keep SSE + visibility-change refetch + SWR 30s stale | Fewer requests, lower latency |
| 5 | Edge cache: `Cache-Control: public, max-age=5` on `GET /decisions` + `ETag` | Repeated visits instant |

**Verify:** Lighthouse `Performance >90`, `GET /decisions` p95 <150ms in `uvicorn.log`.

## C. Parallel track (this week)
- Day 1: A1-A2, B1-B2
- Day 2: A3-A5, B3-B5, rerun 23 tests + `gh pr checks`
