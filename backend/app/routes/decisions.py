from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent, AuditRecord, Decision, DecisionEvent, Task, utcnow
from ..schemas import (
    AgentListResponse,
    ChainVerifyResponse,
    ClaimTaskResponse,
    CompleteResponse,
    DecisionComplete,
    DecisionList,
    DecisionStart,
    DecisionStartResponse,
    EventAppend,
    EventAppended,
    FullDecisionRecord,
    ReplayFinalDecision,
    ReplayIntegrity,
    ReplayResponse,
    ReplayStep,
    StatusUpdate,
    StatusUpdated,
    TaskSummary,
    VerifyResponse,
)
from ..services import decision_ops
from ..services.event_hub import event_hub, format_sse
from ..services.hash_chain import verify_record_hash
from ..services.replay import build_replay
from ..services.sealer import extract_evidence_and_policies

router = APIRouter(prefix="/decisions", tags=["decisions"])


def _iso(dt):
    return dt.isoformat() if dt else None


def _get_task_or_404(db: Session, task_id: str) -> Task:
    task = db.query(Task).filter(Task.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail={"error": "Task not found", "code": "TASK_NOT_FOUND"})
    return task


def _is_sealed(db: Session, task_id: str) -> bool:
    return db.query(AuditRecord).filter(AuditRecord.task_id == task_id).first() is not None


@router.patch("/{task_id}/status", response_model=StatusUpdated)
def update_task_status(task_id: str, payload: StatusUpdate, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    if _is_sealed(db, task_id):
        raise HTTPException(
            status_code=409,
            detail={"error": "Task is sealed to the audit chain and can no longer be modified", "code": "TASK_SEALED"},
        )

    # Integrity invariant (issue #15): a task must not reach a terminal state via a
    # manual status patch. Completed / review_required can only be reached by
    # POST /complete (or POST /agents/runtime), each of which produces a sealed
    # Decision + AuditRecord. Manual moves are for non-terminal lanes only.
    if payload.status in decision_ops.TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409,
            detail={
                "error": (
                    f"Task cannot be moved directly to '{payload.status}' via status PATCH. "
                    "Terminal states require a sealed decision record (POST /complete)."
                ),
                "code": "TASK_NOT_SEALED",
            },
        )

    task.status = payload.status
    db.commit()
    decision_ops.emit_task_status(task.task_id, task.case_id, task.status)
    return StatusUpdated(task_id=task.task_id, status=task.status)


@router.post("/start", response_model=DecisionStartResponse)
def start_decision(payload: DecisionStart, db: Session = Depends(get_db)):
    try:
        task = decision_ops.start_decision(
            db,
            agent_id=payload.agent_id,
            case_id=payload.case_id,
            case_type=payload.case_type,
            inputs=payload.inputs,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail={"error": "Agent not registered", "code": "AGENT_NOT_FOUND"})
    return {"task_id": task.task_id, "status": task.status, "created_at": _iso(task.created_at)}
@router.post("/queue", response_model=DecisionStartResponse)
def queue_decision(payload: DecisionStart, db: Session = Depends(get_db)):
    """Create a card directly in the ``queued`` lane for the dispatcher to claim."""
    try:
        task = decision_ops.queue_decision(
            db,
            agent_id=payload.agent_id,
            case_id=payload.case_id,
            case_type=payload.case_type,
            inputs=payload.inputs,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail={"error": "Agent not registered", "code": "AGENT_NOT_FOUND"})
    return {"task_id": task.task_id, "status": task.status, "created_at": _iso(task.created_at)}


@router.post("/claim", response_model=ClaimTaskResponse)
def claim_next_task(db: Session = Depends(get_db)):
    """Claim the oldest ``queued`` task and move it to ``running`` (dispatcher flow).

    Two workers claiming at once resolve on the row lock: the loser's UPDATE affects
    zero rows, so only one worker actually runs the task.
    """
    claimed = (
        db.query(Task)
        .filter(Task.status == "queued")
        .order_by(Task.created_at.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if not claimed:
        raise HTTPException(status_code=404, detail={"error": "No queued tasks", "code": "NO_QUEUED_TASKS"})

    claimed.status = "running"
    claimed.started_at = utcnow()
    db.add(
        DecisionEvent(
            task_id=claimed.task_id,
            sequence=decision_ops._next_sequence(db, claimed.task_id),
            event_type="case_received",
            summary=f"Research task {claimed.case_id} picked up by dispatcher",
            actor="system",
        )
    )
    db.commit()
    decision_ops.emit_task_status(claimed.task_id, claimed.case_id, "running")

    return {
        "task_id": claimed.task_id,
        "case_id": claimed.case_id,
        "case_type": claimed.case_type,
        "agent_id": claimed.agent_id,
        "status": claimed.status,
        "inputs": claimed.inputs,
        "created_at": _iso(claimed.created_at),
    }


@router.get("/stream")
async def decision_stream():
    """Server-Sent Events: live card movement + event log for the Kanban.

    Emits newline-delimited ``data: <json>`` frames on every status/event change.
    """
    async def gen():
        async for ev in event_hub.subscribe():
            yield format_sse(ev)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{task_id}/events", response_model=EventAppended)
def append_event(task_id: str, payload: EventAppend, db: Session = Depends(get_db)):
    _get_task_or_404(db, task_id)
    try:
        event = decision_ops.append_event(
            db,
            task_id=task_id,
            event_type=payload.event_type,
            summary=payload.summary,
            actor=payload.actor,
            details=payload.details,
        )
    except PermissionError:
        raise HTTPException(status_code=409, detail={"error": "Decision already sealed", "code": "SEALED"})
    return {"event_id": event.event_id, "sequence": event.sequence, "timestamp": _iso(event.timestamp)}


@router.post("/{task_id}/complete", response_model=CompleteResponse)
def complete_decision(task_id: str, payload: DecisionComplete, db: Session = Depends(get_db)):
    _get_task_or_404(db, task_id)
    try:
        return decision_ops.complete_decision(
            db,
            task_id=task_id,
            outcome=payload.outcome,
            outcome_summary=payload.outcome_summary,
            structured_rationale=payload.structured_rationale,
            alternatives_considered=payload.alternatives_considered,
            confidence_score=payload.confidence_score,
            requires_human_review=payload.requires_human_review,
            risk_level=payload.risk_level,
        )
    except PermissionError:
        raise HTTPException(status_code=409, detail={"error": "Decision already sealed", "code": "SEALED"})


def _next_sequence(db: Session, task_id: str) -> int:
    return decision_ops._next_sequence(db, task_id)


@router.get("", response_model=DecisionList)
def list_decisions(
    status: str | None = None,
    risk_level: str | None = None,
    case_id: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Task).join(Agent, Task.agent_id == Agent.agent_id)
    if status:
        query = query.filter(Task.status == status)
    if risk_level:
        query = query.filter(Task.risk_level == risk_level)
    if case_id:
        query = query.filter(Task.case_id.ilike(f"%{case_id}%"))
    tasks = query.order_by(Task.created_at.desc()).all()

    summaries = []
    for task in tasks:
        decision = db.query(Decision).filter(Decision.task_id == task.task_id).first()
        agent = db.query(Agent).filter(Agent.agent_id == task.agent_id).first()
        duration = None
        if task.started_at and task.completed_at:
            duration = (task.completed_at - task.started_at).total_seconds()
        summaries.append(
            TaskSummary(
                task_id=task.task_id,
                case_id=task.case_id,
                case_type=task.case_type,
                agent_name=agent.name if agent else "unknown",
                status=task.status,
                risk_level=task.risk_level,
                outcome=decision.outcome if decision else None,
                outcome_summary=decision.outcome_summary if decision else None,
                duration_seconds=duration,
                human_review_status=task.human_review_status,
                created_at=_iso(task.created_at),
            )
        )
    return {"decisions": summaries, "total": len(summaries)}


@router.get("/chain/verify", response_model=ChainVerifyResponse)
def verify_full_chain(db: Session = Depends(get_db)):
    records = db.query(AuditRecord).order_by(AuditRecord.chain_sequence).all()
    total = len(records)
    previous_hash = "GENESIS"
    for rec in records:
        ok_link = hmac_equal(rec.previous_hash, previous_hash)
        ok_hash = verify_record_hash(rec.record_snapshot, rec.previous_hash, rec.record_hash)
        if not (ok_link and ok_hash):
            return {
                "total_records": total,
                "verified": False,
                "broken_at_sequence": rec.chain_sequence,
                "message": f"Chain broken at record #{rec.chain_sequence}.",
            }
        previous_hash = rec.record_hash
    return {
        "total_records": total,
        "verified": True,
        "broken_at_sequence": None,
        "message": f"All {total} records in chain verified.",
    }


def hmac_equal(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a, b)


@router.get("/{task_id}", response_model=FullDecisionRecord)
def get_decision(task_id: str, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    agent = db.query(Agent).filter(Agent.agent_id == task.agent_id).first()
    events = (
        db.query(DecisionEvent).filter(DecisionEvent.task_id == task_id).order_by(DecisionEvent.sequence).all()
    )
    decision = db.query(Decision).filter(Decision.task_id == task_id).first()
    audit = db.query(AuditRecord).filter(AuditRecord.task_id == task_id).first()
    evidence, policies = extract_evidence_and_policies(events)

    snapshot = audit.record_snapshot if audit else None

    return {
        "task": snapshot["task"] if snapshot else {
            "task_id": task.task_id,
            "case_id": task.case_id,
            "case_type": task.case_type,
            "agent_id": task.agent_id,
            "status": task.status,
            "risk_level": task.risk_level,
            "human_review_status": task.human_review_status,
            "inputs": task.inputs,
            "created_at": _iso(task.created_at),
            "started_at": _iso(task.started_at),
            "completed_at": _iso(task.completed_at),
        },
        "agent": {
            "agent_id": agent.agent_id,
            "name": agent.name,
            "version": agent.version,
            "domain": agent.domain,
        }
        if agent
        else {},
        "events": [
            {
                "event_id": e.event_id,
                "sequence": e.sequence,
                "event_type": e.event_type,
                "timestamp": _iso(e.timestamp),
                "summary": e.summary,
                "details": e.details,
                "actor": e.actor,
            }
            for e in events
        ],
        "evidence": evidence,
        "policy_references": policies,
        "decision": snapshot["decision"]
        if snapshot
        else (
            {
                "decision_id": decision.decision_id,
                "outcome": decision.outcome,
                "outcome_summary": decision.outcome_summary,
                "structured_rationale": decision.structured_rationale,
                "alternatives_considered": decision.alternatives_considered,
                "confidence_score": decision.confidence_score,
                "decided_at": _iso(decision.decided_at),
            }
            if decision
            else None
        ),
        "audit_record": {
            "audit_id": audit.audit_id,
            "record_hash": audit.record_hash,
            "previous_hash": audit.previous_hash,
            "chain_sequence": audit.chain_sequence,
            "sealed_at": _iso(audit.sealed_at),
        }
        if audit
        else None,
    }


@router.get("/{task_id}/replay", response_model=ReplayResponse)
def replay_decision(task_id: str, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    decision = db.query(Decision).filter(Decision.task_id == task_id).first()
    audit = db.query(AuditRecord).filter(AuditRecord.task_id == task_id).first()

    data = build_replay(db, task, decision)

    verified = None
    record_hash = None
    if audit:
        record_hash = audit.record_hash
        verified = verify_record_hash(audit.record_snapshot, audit.previous_hash, audit.record_hash)

    return ReplayResponse(
        task_id=data["task_id"],
        case_id=data["case_id"],
        replay_steps=[ReplayStep(**s) for s in data["steps"]],
        final_decision=ReplayFinalDecision(**data["final_decision"]) if data["final_decision"] else None,
        integrity=ReplayIntegrity(record_hash=record_hash, verified=verified),
    )


@router.get("/{task_id}/verify", response_model=VerifyResponse)
def verify_decision(task_id: str, db: Session = Depends(get_db)):
    _get_task_or_404(db, task_id)
    audit = db.query(AuditRecord).filter(AuditRecord.task_id == task_id).first()
    if not audit:
        return {
            "task_id": task_id,
            "verified": False,
            "record_hash": None,
            "previous_hash": None,
            "chain_sequence": None,
            "sealed_at": None,
            "chain_status": "unsealed",
            "message": "This decision has not been sealed yet.",
        }

    ok_hash = verify_record_hash(audit.record_snapshot, audit.previous_hash, audit.record_hash)

    prior = (
        db.query(AuditRecord)
        .filter(AuditRecord.chain_sequence < audit.chain_sequence)
        .order_by(AuditRecord.chain_sequence.desc())
        .first()
    )
    expected_prev = prior.record_hash if prior else "GENESIS"
    ok_link = hmac_equal(audit.previous_hash, expected_prev)

    if ok_hash and ok_link:
        return {
            "task_id": task_id,
            "verified": True,
            "record_hash": audit.record_hash,
            "previous_hash": audit.previous_hash,
            "chain_sequence": audit.chain_sequence,
            "sealed_at": _iso(audit.sealed_at),
            "chain_status": "intact",
            "message": "Record hash matches computed hash. Chain linkage verified.",
        }
    broken_why = []
    if not ok_hash:
        broken_why.append("record hash mismatch — data may have been altered after sealing")
    if not ok_link:
        broken_why.append("chain linkage broken — previous hash does not match prior record")
    return {
        "task_id": task_id,
        "verified": False,
        "record_hash": audit.record_hash,
        "previous_hash": audit.previous_hash,
        "chain_sequence": audit.chain_sequence,
        "sealed_at": _iso(audit.sealed_at),
        "chain_status": "broken",
        "message": "; ".join(broken_why).capitalize() + ".",
    }
