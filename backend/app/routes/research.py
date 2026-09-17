"""Real research endpoint — query in, streaming LLM out, TrustLedger record sealed."""
import asyncio
import json
import logging
import os
import time
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.registry import get_agent
from app.db import SessionLocal
from app.models import Agent, Task, utcnow
from app.services import decision_ops
from app.services.event_hub import emit_event
from app.services.redaction import redact_inputs

logger = logging.getLogger("trustledger.research")

router = APIRouter(prefix="/research", tags=["research"])

#: Wall-clock ceiling for one streaming research run. When it expires the run is
#: sealed from whatever the model has produced so far, so a card can never sit in
#: `running` indefinitely behind a slow or stalled provider.
RUN_BUDGET_SECS = float(os.environ.get("TRUSTLEDGER_RUN_BUDGET", "75"))

#: Strong references to in-flight background runs. asyncio only holds a weak
#: reference to a task, so without this a run could be garbage-collected
#: mid-flight once the request that started it has gone away.
_ACTIVE_RUNS: set[asyncio.Task] = set()


def _repair_json(text: str) -> dict | None:
    """Recover a usable object from JSON cut off mid-structure.

    A run that hits the token cap or the wall-clock budget ends partway
    through the object. Rather than discard everything, drop the incomplete
    trailing element and close whatever brackets are still open, which keeps
    the fields the model did finish.
    """
    start = text.find("{")
    if start == -1:
        return None
    body = text[start:]

    depth_stack: list[str] = []
    in_string = escaped = False
    cut = None  # index just past the last completed top-level member
    for i, ch in enumerate(body):
        if escaped:
            escaped = False
            continue
        if in_string:
            if ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            depth_stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if depth_stack:
                depth_stack.pop()
        elif ch == "," and len(depth_stack) == 1:
            cut = i  # a complete member of the root object ends here

    candidates = []
    if not depth_stack:
        candidates.append(body)
    # Closing the brackets still open at the end only works when the cut landed
    # somewhere benign; try it first, then fall back to rewinding to the last
    # complete top-level member, where by definition only the root `{` is open.
    candidates.append(body + "".join(reversed(depth_stack)))
    if cut is not None:
        candidates.append(body[:cut] + "}")

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue
    return None

def _parse(raw_text: str) -> dict:
    """Best-effort JSON extraction from whatever the model streamed."""
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    repaired = _repair_json(raw_text)
    if repaired is not None:
        return repaired
    # Nothing structured survived — surface the text rather than lose the run.
    return {
        "primary_reason": raw_text[:500],
        "outcome": "recommended_with_caveats",
        "outcome_summary": raw_text[:400],
        "supporting_factors": [], "policy_basis": [],
        "evidence_basis": [], "exclusions_applied": [],
    }


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

        # case_id is an identifier, not a headline. It used to be the question
        # text truncated to 75 chars, which chopped real questions mid-word,
        # made every rerun of a question collide, and left the record header
        # showing a sentence fragment. The full question lives in `inputs`.
        case_id = f"RES-{utcnow():%Y}-{uuid.uuid4().int % 1_000_000:06d}"
        while db0.query(Task).filter(Task.case_id == case_id).first():
            case_id = f"RES-{utcnow():%Y}-{uuid.uuid4().int % 1_000_000:06d}"

        task = Task(
            case_id=case_id,
            case_type=payload.case_type or "Prompt run",
            agent_id=agent_id,
            status="queued",
            inputs=redact_inputs({
                "client_name": payload.client_name or "Prompt run",
                "research_question": query,
                "prompt": query,
                "case_type": payload.case_type or "Prompt run",
            }),
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
    def _seal_from_llm(raw_text: str, note: str | None = None) -> dict | None:
        """Write evidence/policy events and seal the decision from model output.

        Synchronous and self-contained (its own session, no awaits) so it can run
        from the background worker after the client has already gone away.
        Returns ``None`` when there is nothing usable to seal.
        """
        from app.services.llm import parse_llm_result

        if not raw_text.strip():
            return None
        raw = _parse(raw_text)
        # A response can be valid JSON and still be useless — routed models
        # sometimes reply with a tool/search call such as
        # {"query": ..., "top_n": 10}. parse_llm_result would happily default
        # every field and seal a hollow "Analysis complete." record, so reject
        # anything carrying none of the fields we actually asked for and let the
        # caller fall through to the template instead.
        if not any(raw.get(k) for k in ("outcome", "outcome_summary", "primary_reason")):
            logger.warning("task %s: model returned no usable fields (%s)", task_id, sorted(raw)[:8])
            return None
        parsed = parse_llm_result(raw, task_inputs)
        dbs = SessionLocal()
        try:
            policies = parsed.get("policy_details") or []
            evidences = parsed.get("evidence_details") or []

            def _append(evt, summ, det=None):
                try:
                    # append_event already publishes its own SSE frame.
                    decision_ops.append_event(dbs, task_id=task_id, event_type=evt, summary=summ, details=det)
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
            if note:
                _append("processing_note", note)
            sealed = decision_ops.complete_decision(
                dbs,
                task_id=task_id,
                outcome=parsed["outcome"],
                outcome_summary=parsed["outcome_summary"],
                structured_rationale=parsed["structured_rationale"],
                confidence_score=parsed["confidence_score"],
                requires_human_review=parsed["requires_human_review"],
                risk_level=parsed["risk_level"],
            )
            # complete_decision does not echo the outcome back, but the `done`
            # frame needs it, so carry it out of here.
            return {**sealed, "outcome": parsed["outcome"]}
        except PermissionError:
            return None  # already sealed by another path
        finally:
            dbs.close()

    async def _worker(out: asyncio.Queue):
        """Run the research to a sealed decision, streaming frames onto ``out``.

        This runs as its own asyncio task, deliberately NOT tied to the HTTP
        request. When the browser navigates away mid-run (TaskCard links with a
        plain <a href>, which is a full page load), Starlette cancels the
        response generator — but this task survives and still seals the record,
        instead of stranding the card in `running` with no reaper to recover it.
        """
        def emit(frame):
            try:
                out.put_nowait(frame)
            except asyncio.QueueFull:
                pass  # nobody is reading fast enough; the seal is what matters

        sealed = None
        try:
            if os.environ.get("OPENROUTER_API_KEY"):
                from app.services.llm import build_user_prompt, stream_complete

                collected = ""
                note = None
                try:
                    deadline = time.monotonic() + RUN_BUDGET_SECS
                    async for token in stream_complete(build_user_prompt(task_inputs, task_case_type)):
                        collected += token
                        emit({"type": "token", "token": token})
                        if time.monotonic() >= deadline:
                            # Seal from partial output rather than let a slow or
                            # stalled provider hold the card open indefinitely.
                            note = f"Generation stopped at the {RUN_BUDGET_SECS:.0f}s budget; sealed from partial output."
                            emit({"type": "status", "message": note})
                            break
                except Exception as exc:
                    emit({"type": "status", "message": f"LLM streaming failed, using template: {str(exc)[:140]}"})
                    collected = ""  # fall through to the template path

                sealed = _seal_from_llm(collected, note)

            if sealed is None:
                # Template path: deterministic, offline-safe, with typing delays.
                from agents.base import AgentContext

                dbs = SessionLocal()
                try:
                    ctx = AgentContext(db=dbs, agent_id=agent_id, name=agent_name, domain=agent_domain, version=agent_version)
                    for s in agent_instance.build_steps(ctx, task_inputs):
                        await asyncio.sleep(0.28)
                        emit({"type": "token", "token": f"\n[{s.event_type}] {s.summary}\n"})
                        try:
                            decision_ops.append_event(dbs, task_id=task_id, event_type=s.event_type, summary=s.summary, actor=s.actor, details=s.details)
                        except Exception:
                            pass
                    result_obj = agent_instance.decide(ctx, task_inputs)
                    for i in range(0, len(result_obj.outcome_summary), 36):
                        emit({"type": "token", "token": result_obj.outcome_summary[i:i + 36]})
                        await asyncio.sleep(0.03)
                    seal = decision_ops.complete_decision(
                        dbs,
                        task_id=task_id,
                        outcome=result_obj.outcome,
                        outcome_summary=result_obj.outcome_summary,
                        structured_rationale=result_obj.structured_rationale,
                        confidence_score=result_obj.confidence_score,
                        requires_human_review=result_obj.requires_human_review,
                        risk_level=result_obj.risk_level,
                    )
                    sealed = {**seal, "outcome": result_obj.outcome}
                except PermissionError:
                    sealed = None  # already sealed
                finally:
                    dbs.close()

            if sealed is not None:
                emit({"type": "done", "task_id": task_id, "case_id": case_id_final,
                      "status": sealed["status"], "outcome": sealed["outcome"]})
        except Exception as exc:  # noqa: BLE001 - never let a run die silently
            logger.exception("research run failed for task %s", task_id)
            emit({"type": "error", "message": str(exc)[:500]})
        finally:
            emit(None)  # sentinel: tells the SSE generator the run is over

    async def gen():
        queue: asyncio.Queue = asyncio.Queue(maxsize=2000)
        worker = asyncio.create_task(_worker(queue))
        # Hold a strong reference, or the loop may garbage-collect the task.
        _ACTIVE_RUNS.add(worker)
        worker.add_done_callback(_ACTIVE_RUNS.discard)

        yield _sse({"type": "status", "message": "Research started", "task_id": task_id, "case_id": case_id_final, "status": "running"})
        while True:
            frame = await queue.get()
            if frame is None:
                break
            yield _sse(frame)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
