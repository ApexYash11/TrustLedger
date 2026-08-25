from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent, AuditRecord, Decision, DecisionEvent, Task, new_uuid, utcnow
from ..schemas import (
    ChainVerifyResponse,
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
    TaskSummary,
    VerifyResponse,
)
from ..services.hash_chain import verify_record_hash
from ..services.replay import build_replay
from ..services.sealer import build_snapshot, extract_evidence_and_policies, latest_audit_record, seal_record

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


@router.post("/start", response_model=DecisionStartResponse)
def start_decision(payload: DecisionStart, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.agent_id == payload.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail={"error": "Agent not registered", "code": "AGENT_NOT_FOUND"})

    now = utcnow()
    task = Task(
        case_id=payload.case_id,
        case_type=payload.case_type,
        agent_id=payload.agent_id,
        status="running",
        inputs=payload.inputs,
        created_at=now,
        started_at=now,
    )
    db.add(task)
    db.flush()

    event = DecisionEvent(
        task_id=task.task_id,
        sequence=1,
        event_type="case_received",
        summary=f"Claim {task.case_id} received for automated review",
        actor="system",
        details=None,
        timestamp=now,
    )
    db.add(event)
    db.commit()
    return {"task_id": task.task_id, "status": task.status, "created_at": _iso(task.created_at)}


@router.post("/{task_id}/events", response_model=EventAppended)
def append_event(task_id: str, payload: EventAppend, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    if _is_sealed(db, task_id):
        raise HTTPException(status_code=409, detail={"error": "Decision already sealed", "code": "SEALED"})

    last_seq = (
        db.query(DecisionEvent.sequence)
        .filter(DecisionEvent.task_id == task_id)
        .order_by(DecisionEvent.sequence.desc())
        .first()
    )
    sequence = (last_seq[0] + 1) if last_seq else 1

    event = DecisionEvent(
        event_id=new_uuid(),
        task_id=task_id,
        sequence=sequence,
        event_type=payload.event_type,
        timestamp=utcnow(),
        summary=payload.summary,
        details=payload.details,
        actor=payload.actor,
    )
    db.add(event)
    db.commit()
    return {"event_id": event.event_id, "sequence": event.sequence, "timestamp": _iso(event.timestamp)}


@router.post("/{task_id}/complete", response_model=CompleteResponse)
def complete_decision(task_id: str, payload: DecisionComplete, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    if _is_sealed(db, task_id):
        raise HTTPException(status_code=409, detail={"error": "Decision already sealed", "code": "SEALED"})

    now = utcnow()
    decision = Decision(
        decision_id=new_uuid(),
        task_id=task_id,
        outcome=payload.outcome,
        outcome_summary=payload.outcome_summary,
        structured_rationale=payload.structured_rationale,
        alternatives_considered=payload.alternatives_considered,
        confidence_score=payload.confidence_score,
        decided_at=now,
    )
    db.add(decision)

    if payload.risk_level:
        task.risk_level = payload.risk_level

    if payload.requires_human_review:
        task.status = "review_required"
        task.human_review_status = "triggered"
        db.add(
            DecisionEvent(
                task_id=task_id,
                sequence=_next_sequence(db, task_id),
                event_type="human_review_triggered",
                summary="Flagged for human review",
                actor="system",
                details={"trigger_reason": "requires_human_review set by agent"},
            )
        )
    else:
        task.status = "completed"
        task.human_review_status = "not_required"

    db.flush()

    db.add(
        DecisionEvent(
            task_id=task_id,
            sequence=_next_sequence(db, task_id),
            event_type="decision_generated",
            summary=payload.outcome_summary,
            actor="agent",
        )
    )
    db.flush()

    task.completed_at = now

    audit = seal_record(db, task, decision)

    db.add(
        DecisionEvent(
            task_id=task_id,
            sequence=_next_sequence(db, task_id),
            event_type="record_sealed",
            summary="Decision record sealed and hash-chained",
            actor="system",
        )
    )
    db.flush()

    # Snapshot must include the record_sealed event; rebuild and recompute hash.
    final_snapshot = build_snapshot(db, task, decision)
    from ..services.hash_chain import compute_record_hash

    audit.record_snapshot = final_snapshot
    audit.record_hash = compute_record_hash(final_snapshot, audit.previous_hash)

    db.commit()
    return {
        "decision_id": decision.decision_id,
        "task_id": task_id,
        "status": task.status,
        "audit_record": {
            "audit_id": audit.audit_id,
            "record_hash": audit.record_hash,
            "previous_hash": audit.previous_hash,
            "chain_sequence": audit.chain_sequence,
            "sealed_at": _iso(audit.sealed_at),
        },
    }


def _next_sequence(db: Session, task_id: str) -> int:
    last = (
        db.query(DecisionEvent.sequence)
        .filter(DecisionEvent.task_id == task_id)
        .order_by(DecisionEvent.sequence.desc())
        .first()
    )
    return (last[0] + 1) if last else 1


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
