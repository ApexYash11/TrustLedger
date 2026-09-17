# TrustLedger — Current Status

> **Last updated:** 17 September 2026
> **Branch:** `feat/live-research-openrouter` → PR #22 · `docs/refresh-readme-and-docs` (this refresh)  
> **Companion:** `09_HLD.md` (HLD) · `13_Review_Coverage_and_Load_Plan.md` · `14_Frontend_Realism_Plan.md`

---

## 1. One-Paragraph Status

TrustLedger records AI research decisions as tamper-evident, hash-chained
audit records. A question enters via `POST /api/v1/research/stream`, the agent
answers through OpenRouter (default `openai/gpt-4o-mini`), every step is logged
as a `decision_event`, and the whole record — question, events, sources,
standards, rationale, outcome — is frozen into a SHA-256 snapshot chained to the
record before it. Runs complete in 4-10s, survive a client disconnect, and
cannot exceed a 75s wall-clock budget. The board and record view share one
vocabulary of status, outcome and risk, and sealed records are visibly immutable.
`23/23` backend tests pass and the frontend builds clean.

API-key auth attributes every event to a principal that is sealed into the chain, and PII in research inputs is redacted before the model or the ledger sees it. **The integrity layer is the product.** The research quality is the weakest part
and is scoped accordingly: sources are asserted by the model, not retrieved.

## 2. Roadmap Position

```
Week 1          Week 2          Week 3          Week 4
Aug 18–24       Aug 25–31       Sep 1–7         Sep 8–14
─────────────   ─────────────   ─────────────   ─────────────
Product +   ✔   Backend +   ✔   Dashboard + ✔   Streaming + ✔
Architecture    Agent+Seed      Trail/Replay    Graph+Polish
                                            PR #22 + docs refresh
```

✔ done (Week 4 covers prior “Integrity + Polish + Demo” plus streaming research)

| Deliverable | Status | Notes |
|-------------|--------|-------|
| PostgreSQL schema (5 tables) | ✅ Done | `models.py` 5 tables, JSONB, unique constraints |
| `POST /decisions/start|events|complete` (seal + hash) | ✅ Done | `routes/decisions.py` 9 endpoints |
| `POST /research/stream` SSE | ✅ Done | `routes/research.py:19` — streaming LLM + ledger seal |
| `GET /decisions/{id}{/replay|/verify}` + `GET /decisions/chain/verify` | ✅ Done | `hash_chain.py:GENESIS`, `sealer.py`, `replay.py` |
| OpenRouter LLM service | ✅ Done | `services/llm.py` — pinned model, `max_tokens` cap, JSON response format, template fallback |
| ResearchAgent + ComplianceBot | ✅ Done | `research_agent.py:1.3.0` LLM+template, `dispatcher_loop` 0.7s |
| Seed (16 + live) | ✅ Done | 5 hand-crafted + 7 quick + 2 running + 2 queued; every seeded task now carries a real research question |
| Board + Record (4 tabs) + Graph | ✅ Done | Shared `vocab.ts` palette, sealed-state affordances, computed-layout SVG graph |
| Docker Compose | ✅ Ready | `postgres + backend + frontend`, `env_file .env` |
| Tests `23/23` | ✅ Done | 5 hash + 7 API + 11 runtime/integrity/dispatcher |

**Exit check:** Type a question on the board → tokens stream, card moves `queued → running → completed/review_required`, click → Graph shows client→question→evidence/policy→outcome, Trail/Replay/Verify all green except tampered `RES-2026-009999`.

---

## 3. What Exists in Code Today

```
TrustLedger/  (PR #22 → this docs refresh)
├── backend/
│   ├── app/services/llm.py         OpenRouter streaming (TRUSTLEDGER_MODEL)
│   ├── app/routes/research.py      POST /research/stream SSE (status/token/done)
│   ├── app/routes/decisions.py     9 endpoints + stream + verify chain
│   ├── agents/research_agent.py    LLM+template, 1.3.0
│   ├── app/main.py                 lifespan, CORS, dispatcher 0.7s
│   └── tests/                      23 tests
├── frontend/
│   ├── src/app/page.tsx            minimal board (no stats/filter/tip)
│   ├── src/app/decisions/[taskId]/page.tsx  deduped What was asked + DecisionGraph hero
│   ├── src/components/DecisionGraph.tsx      SVG graph (supports/applies_to)
│   ├── src/components/Sidebar.tsx  Board only, no AI-decides card
│   └── src/lib/api.ts              streamResearch SSE client
├── docs/13_Review_Coverage_and_Load_Plan.md  skip-review + <400ms plan
├── docs/14_Frontend_Realism_Plan.md         Deloitte-grade realism plan
└── .env.example                    OPENROUTER_API_KEY, TRUSTLEDGER_MODEL
```

---

## 4. Verification Evidence

### Automated tests — 23/23 passing
| Suite | Proves |
|-------|--------|
| Hash chain (5) | canonical JSON determinism, SHA-256, tamper detection, chain linking |
| API flow (7) | lifecycle verify pass, tampered fails, 409 sealed, 422 rationale, 404 agent, list filters, chain verify |
| Runtime/dispatcher (11) | queued→running claim, no double-claim, idempotent register, terminal guard, requeue on crash, SSE |

### Live streaming test (Sep 14, `openrouter/free`; re-measured Sep 17)
```
POST /research/stream "Should Tata Power enter Rajasthan EV charging in FY27?"
→ status: Research started (task ...-e97325, running)
→ tokens: { primary_reason, supporting_factors, evidence_details[3], policy_details[3] } streamed
→ done: recommended_with_caveats, review_required
→ verify: True / intact / chain #17
→ replay: 9 steps, evidence 2, policies 2
```

### Quality gates
- PR #22: `frontend build` ✔, `23 tests` ✔, GitGuardian incident 36592553 triaged (env_file, no secrets in code)
- Prior PRs #11/#18/#19 closed as superseded by #22

---

## 5. Key Decisions Since Last Update
| Decision | Rationale |
|----------|-----------|
| Model choice | `openrouter/free` costs nothing but is a **router**: measured over 3 runs it returned one empty response and one web-search tool call instead of an answer. `openai/gpt-4o-mini` returned all 12 fields on 3/3 runs in 4-10s. Pin a model for a demo; the free router is fine for offline development. |
| `POST /research/stream` SSE instead of only `/decisions/queue` + dispatcher | User-requested query→streaming→record flow; prompt bar streams live |
| `DecisionGraph` SVG in Summary | User-requested decision tree linking evidence/policy → outcome (was missing) |
| Remove board stats/filter/tip + sidebar AI-decides card + column Add Task duplicates | User-requested declutter: fewer buttons/text, single Add Task |
| Dedupe `What was asked` to Q + Client + Case type | Fixes 3× duplicate rows on running tasks |
| Dispatcher `0.7s` (was 2s), poll `10s` fallback + SSE primary | Lower perceived latency per `13_Review_Coverage_and_Load_Plan.md` |

---

## 6. Known Limitations (Intentional)
- No auth/RBAC (per `08_Scope_and_Non_Goals.md`)
- Hash on standard DB, chain-head not serialized across concurrent sealers (single-user demo)
- Free-model latency (swap `TRUSTLEDGER_MODEL` to paid model for production speed)
- `GET /decisions` not yet paginated/joined-load optimized (see `13_…Plan.md` B1)

---

## 7. Next Steps
1. Merge PR #22, then this docs refresh PR
2. Execute `13_Review_Coverage_and_Load_Plan.md` A/B (skipped 10 → issues + dashboard <400ms)
3. Execute `14_Frontend_Realism_Plan.md` P1–P4 in parallel (board/record polish)
4. Demo rehearsal with live prompt `DMart quick-commerce Pune?` or hero `RES-2026-004821`

---

## 8. How to Run (Current)
```bash
cp .env.example .env  # set OPENROUTER_API_KEY=... ; TRUSTLEDGER_MODEL=openai/gpt-4o-mini
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000  # :8000/docs
cd backend && python -m pytest tests -q  # 23 passed
cd frontend && npm install && npm run dev  # :3000 — Ask a research question… streams live
docker compose up --build  # full stack
```
