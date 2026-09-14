# TrustLedger — Current Status

> **Last updated:** 14 September 2026 (Week 4)  
> **Branch:** `feat/live-research-openrouter` → PR #22 · `docs/refresh-readme-and-docs` (this refresh)  
> **Companion:** `09_HLD.md` (HLD) · `13_Review_Coverage_and_Load_Plan.md` · `14_Frontend_Realism_Plan.md`

---

## 1. One-Paragraph Status

TrustLedger is **live with real streaming research**: OpenRouter `openrouter/free` router (free, no credits) drives `ResearchAgent` v1.3.0 via `POST /api/v1/research/stream` (`status → token* → done` SSE), sealing each run as a hash-chained, graph-shaped decision record (evidence/policy nodes linked to the recommendation, visualized in `DecisionGraph`). Board is minimal (single `Add Task`, `Ask a research question…` prompt, no stats/filter noise), detail dedupes `What was asked` and shows the knowledge graph hero. Backend `23/23` tests pass, frontend builds `5.94kB`, seed `16` records plus live stream records (tampered `RES-2026-009999` demonstrates `verify: broken`). Superseded PRs #11, #18, #19 closed into #22.

---

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
| OpenRouter LLM service | ✅ Done | `services/llm.py:1` — `openrouter/free`, fallback to template, 60s timeout |
| ResearchAgent + ComplianceBot | ✅ Done | `research_agent.py:1.3.0` LLM+template, `dispatcher_loop` 0.7s |
| Seed (16 + live) | ✅ Done | `demo_data.json` 5 hand-crafted + 7 quick + 2 running + 2 queued; live stream adds `RES-…-e97325` etc |
| Board (minimal) + Detail (4 tabs) + Graph | ✅ Done | `page.tsx:5.94kB` minimal, `decisions/[taskId]:7.48kB` with `DecisionGraph.tsx` |
| Docker Compose | ✅ Ready | `postgres + backend + frontend`, `env_file .env` |
| Tests `23/23` | ✅ Done | 5 hash + 7 API + 11 runtime/integrity/dispatcher |

**Exit check:** Type a question on the board → tokens stream, card moves `queued → running → completed/review_required`, click → Graph shows client→question→evidence/policy→outcome, Trail/Replay/Verify all green except tampered `RES-2026-009999`.

---

## 3. What Exists in Code Today

```
TrustLedger/  (PR #22 → this docs refresh)
├── backend/
│   ├── app/services/llm.py         OpenRouter streaming (openrouter/free)
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
└── .env.example                    OPENROUTER_API_KEY, TRUSTLEDGER_MODEL=openrouter/free
```

---

## 4. Verification Evidence

### Automated tests — 23/23 passing
| Suite | Proves |
|-------|--------|
| Hash chain (5) | canonical JSON determinism, SHA-256, tamper detection, chain linking |
| API flow (7) | lifecycle verify pass, tampered fails, 409 sealed, 422 rationale, 404 agent, list filters, chain verify |
| Runtime/dispatcher (11) | queued→running claim, no double-claim, idempotent register, terminal guard, requeue on crash, SSE |

### Live streaming test (Sep 14, `openrouter/free`)
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
| `openrouter/free` as default model | Real streaming with 0 credits; paid `gpt-4o-mini` needs 402 |
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
cp .env.example .env  # set OPENROUTER_API_KEY=sk-or-v1-... ; TRUSTLEDGER_MODEL=openrouter/free
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000  # :8000/docs
cd backend && python -m pytest tests -q  # 23 passed
cd frontend && npm install && npm run dev  # :3000 — Ask a research question… streams live
docker compose up --build  # full stack
```
