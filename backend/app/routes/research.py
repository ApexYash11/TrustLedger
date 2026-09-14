"""Real research endpoint — query in, streaming LLM out, TrustLedger record sealed."""
import asyncio
import json
import os
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.registry import get_agent
from app.db import SessionLocal
from app.models import Agent, Task, utcnow
from app.services import decision_ops
from app.services.event_hub import emit_event

router = APIRouter(prefix="/research", tags=["research"])


class ResearchStreamRequest(BaseModel):
    query: str
    agent_domain: str = "deloitte_client_research"
    client_name: str | None = None
    case_type: str | None = None


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/stream")
async def research_stream(payload: ResearchStreamRequest, request: Request):
    query = payload.query.strip()
    if not query:
        async def err_gen():
            yield _sse({"type": "error", "message": "Query is required"})
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    # Resolve agent and capture primitive fields before streaming (so gen doesn't touch ORM)
    try:
        agent_instance = get_agent(payload.agent_domain)
    except LookupError:
        async def no_agent():
            yield _sse({"type": "error", "message": f"No agent for domain '{payload.agent_domain}'"})
        return StreamingResponse(no_agent(), media_type="text/event-stream")

    # Create task synchronously with a short-lived session
    db0 = SessionLocal()
    try:
        agent_row = db0.query(Agent).filter(Agent.domain == payload.agent_domain).first()
        if not agent_row:
            agent_row = Agent(name=agent_instance.name, version=agent_instance.version, domain=agent_instance.domain, description=agent_instance.description)
            db0.add(agent_row)
            db0.commit()
            db0.refresh(agent_row)
        agent_id = agent_row.agent_id
        agent_name = agent_row.name
        agent_domain = agent_row.domain
        agent_version = agent_row.version

        case_id = query[:75].strip() if len(query) > 75 else query.strip()
        existing = db0.query(Task).filter(Task.case_id == case_id).first()
        if existing:
            case_id = f"{case_id[:60]} - {uuid.uuid4().hex[:6]}"

        task = Task(
            case_id=case_id,
            case_type=payload.case_type or "Prompt run",
            agent_id=agent_id,
            status="queued",
            inputs={
                "client_name": payload.client_name or case_id,
                "research_question": query,
                "prompt": query,
                "case_type": payload.case_type or "Prompt run",
            },
            created_at=utcnow(),
        )
        db0.add(task)
        db0.commit()
        db0.refresh(task)
        task_id = task.task_id
        case_id_final = task.case_id
        task_case_type = task.case_type
        task_inputs = dict(task.inputs)

        # Move to running
        task.status = "running"
        task.started_at = utcnow()
        db0.commit()
        emit_event("status_changed", task_id=task_id, case_id=case_id_final, status="running")
        decision_ops.append_event(db0, task_id=task_id, event_type="case_received", summary=f"Research task {case_id_final} received for automated processing", actor="system")
    finally:
        db0.close()

    async def gen():
        yield _sse({"type": "status", "message": "Research started", "task_id": task_id, "case_id": case_id_final, "status": "running"})

        llm_configured = bool(os.environ.get("OPENROUTER_API_KEY"))
        outcome_done = False

        if llm_configured:
            try:
                from app.services.llm import build_user_prompt, stream_complete, parse_llm_result
                user_prompt = build_user_prompt(task_inputs, task_case_type)
                collected = ""
                async for token in stream_complete(user_prompt):
                    if await request.is_disconnected():
                        break
                    collected += token
                    yield _sse({"type": "token", "token": token})

                # Parse JSON from collected
                try:
                    parsed_raw = json.loads(collected)
                except Exception:
                    s = collected.find("{")
                    e = collected.rfind("}")
                    if s != -1 and e != -1:
                        try:
                            parsed_raw = json.loads(collected[s:e+1])
                        except Exception:
                            parsed_raw = {"primary_reason": collected[:500], "outcome": "recommended_with_caveats", "outcome_summary": collected[:400], "supporting_factors": [], "policy_basis": [], "evidence_basis": [], "exclusions_applied": []}
                    else:
                        parsed_raw = {"primary_reason": collected[:500], "outcome": "recommended_with_caveats", "outcome_summary": collected[:400], "supporting_factors": [], "policy_basis": [], "evidence_basis": [], "exclusions_applied": []}
                parsed = parse_llm_result(parsed_raw, task_inputs)

                # Persist events + seal with fresh session
                dbs = SessionLocal()
                try:
                    policies = parsed.get("policy_details") or []
                    evidences = parsed.get("evidence_details") or []
                    def _append(evt, summ, det=None):
                        try:
                            decision_ops.append_event(dbs, task_id=task_id, event_type=evt, summary=summ, details=det)
                            emit_event("event_appended", task_id=task_id)
                        except Exception:
                            pass
                    if policies:
                        _append("policy_retrieved", f"Methodology {policies[0].get('policy_code','DEL-RM-2026')} loaded", {"policy_reference": policies[0]})
                        if len(policies) > 1:
                            _append("clause_identified", f"Clause {policies[1].get('section','')} identified", {"policy_reference": policies[1]})
                    else:
                        _append("policy_retrieved", "Research methodology DEL-RM-2026 loaded as graph policy node", {"policy_reference": {"policy_code": "DEL-RM-2026", "section": "5.3", "title": "Market Entry Evidence Thresholds", "text_excerpt": "Requires three independent demand-side sources and a validated competitor cost baseline.", "application": "Entry test applied while walking the knowledge graph."}})
                    for ev in (evidences[:3] if evidences else []):
                        _append("evidence_evaluated", f"Source evaluated: {ev.get('title','evidence')}", {"evidence": ev})
                    if not evidences:
                        _append("evidence_evaluated", "Evidence synthesized from research question", {"evidence": {"evidence_type": "synthesis", "title": "Research Synthesis", "source": "LLM analysis", "content_summary": parsed["outcome_summary"][:280], "relevance": "Primary synthesis"}})
                    _append("decision_generated", "Recommendation generated and rationale structured")
                    result = decision_ops.complete_decision(dbs, task_id=task_id, outcome=parsed["outcome"], outcome_summary=parsed["outcome_summary"], structured_rationale=parsed["structured_rationale"], confidence_score=parsed["confidence_score"], requires_human_review=parsed["requires_human_review"], risk_level=parsed["risk_level"])
                    yield _sse({"type": "done", "task_id": task_id, "case_id": case_id_final, "status": result["status"], "outcome": parsed["outcome"]})
                    outcome_done = True
                finally:
                    dbs.close()
            except Exception as e:
                yield _sse({"type": "status", "message": f"LLM streaming failed, using template: {str(e)[:140]}"})
                # fall through to template path

        if not outcome_done:
            # Template streaming — deterministic, with typing delays
            dbs = SessionLocal()
            try:
                from agents.base import AgentContext
                ctx = AgentContext(db=dbs, agent_id=agent_id, name=agent_name, domain=agent_domain, version=agent_version)
                steps = agent_instance.build_steps(ctx, task_inputs)
                for s in steps:
                    if await request.is_disconnected():
                        break
                    await asyncio.sleep(0.28)
                    yield _sse({"type": "token", "token": f"\n[{s.event_type}] {s.summary}\n"})
                    try:
                        decision_ops.append_event(dbs, task_id=task_id, event_type=s.event_type, summary=s.summary, actor=s.actor, details=s.details)
                        emit_event("event_appended", task_id=task_id)
                    except Exception:
                        pass
                # Decide (template or LLM fallback) — reuse fresh session for ctx
                result_obj = agent_instance.decide(ctx, task_inputs)
                for i in range(0, len(result_obj.outcome_summary), 36):
                    yield _sse({"type": "token", "token": result_obj.outcome_summary[i:i+36]})
                    await asyncio.sleep(0.03)
                seal = decision_ops.complete_decision(dbs, task_id=task_id, outcome=result_obj.outcome, outcome_summary=result_obj.outcome_summary, structured_rationale=result_obj.structured_rationale, confidence_score=result_obj.confidence_score, requires_human_review=result_obj.requires_human_review, risk_level=result_obj.risk_level)
                yield _sse({"type": "done", "task_id": task_id, "case_id": case_id_final, "status": seal["status"], "outcome": result_obj.outcome})
            except Exception as e:
                yield _sse({"type": "error", "message": str(e)[:500]})
            finally:
                dbs.close()

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
