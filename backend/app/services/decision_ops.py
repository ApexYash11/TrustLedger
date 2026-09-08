"""Shared decision-lifecycle operations used by the API routes, the seed loader,
and the agent runtime so every write path follows the same rules.

Centralising start / append-event / complete here keeps the integrity invariant in
one place: a task can only reach a terminal state (``completed`` / ``review_required``)
through :func:`complete_decision`, which always produces a sealed ``Decision`` +
``AuditRecord``. Manual ``status`` patches are restricted to non-terminal moves.
"""
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models import Agent, AuditRecord, Decision, DecisionEvent, Task, new_uuid, utcnow
from ..services.sealer import seal_record
from agents.registry import has_agent_implementation
from .event_hub import emit_event

TERMINAL_STATUSES = {"completed", "review_required"}
#: non-terminal statuses a manual PATCH may move a card between (dragging the card)
NON_TERMINAL_STATUSES = {"queued", "running", "disputed"}


def _next_sequence(db: Session, task_id: str) -> int:
    last = (
        db.query(DecisionEvent.sequence)
        .filter(DecisionEvent.task_id == task_id)
        .order_by(DecisionEvent.sequence.desc())
        .first()
    )
    return (last[0] + 1) if last else 1


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def emit_task_status(task_id: str, case_id: str, status: str) -> None:
    """Broadcast a status transition to live SSE subscribers (Kanban card move)."""
    emit_event("status_changed", task_id=task_id, case_id=case_id, status=status)


def is_sealed(db: Session, task_id: str) -> bool:
    return db.query(AuditRecord).filter(AuditRecord.task_id == task_id).first() is not None


def get_latest_audit(db: Session, task_id: str) -> Optional[AuditRecord]:
    return db.query(AuditRecord).filter(AuditRecord.task_id == task_id).first()


def start_decision(db: Session, *, agent_id: str, case_id: str, case_type: str, inputs: dict) -> Task:
    """Create a task in ``running`` state with its first ``case_received`` event."""
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if not agent:
        raise LookupError("AGENT_NOT_FOUND")

    now = utcnow()
    task = Task(
        case_id=case_id,
        case_type=case_type,
        agent_id=agent_id,
        status="running",
        inputs=inputs,
        created_at=now,
        started_at=now,
    )
    db.add(task)
    db.flush()
    db.add(
        DecisionEvent(
            task_id=task.task_id,
            sequence=1,
            event_type="case_received",
            summary=f"Research task {case_id} received for automated processing",
            actor="system",
            details=None,
            timestamp=now,
        )
    )
    db.commit()
    emit_event("status_changed", task_id=task.task_id, case_id=case_id, status="running")
    return task


def queue_decision(
    db: Session, *, agent_id: str, case_id: str, case_type: str, inputs: dict
) -> Task:
    """Create a task in ``queued`` state, ready for an agent to claim at runtime.

    Raises:
        LookupError: ``AGENT_NOT_FOUND`` when ``agent_id`` is unknown, or
            ``NO_AGENT_IMPLEMENTATION`` when the agent's domain has no registered
            DiveAgent — such a task could never be dispatched, so it is rejected
            at queue time instead of stranding in the ``queued`` lane.
    """
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if not agent:
        raise LookupError("AGENT_NOT_FOUND")
    if not has_agent_implementation(agent.domain):
        raise LookupError("NO_AGENT_IMPLEMENTATION")
    task = Task(
        case_id=case_id,
        case_type=case_type,
        agent_id=agent_id,
        status="queued",
        inputs=inputs,
        created_at=utcnow(),
    )
    db.add(task)
    db.commit()
    emit_event("status_changed", task_id=task.task_id, case_id=case_id, status="queued")
    return task


def append_event(
    db: Session,
    *,
    task_id: str,
    event_type: str,
    summary: str,
    actor: str = "agent",
    details: Optional[dict] = None,
    timestamp=None,
    commit: bool = True,
) -> DecisionEvent:
    if is_sealed(db, task_id):
        raise PermissionError("SEALED")

    event = DecisionEvent(
        event_id=new_uuid(),
        task_id=task_id,
        sequence=_next_sequence(db, task_id),
        event_type=event_type,
        timestamp=timestamp or utcnow(),
        summary=summary,
        details=details,
        actor=actor,
    )
    db.add(event)
    if commit:
        db.commit()
        emit_event("event_appended", task_id=task_id, sequence=event.sequence, kind=event.event_type)
    return event


def complete_decision(
    db: Session,
    *,
    task_id: str,
    outcome: str,
    outcome_summary: str,
    structured_rationale: dict,
    alternatives_considered: Optional[list] = None,
    confidence_score: Optional[float] = None,
    requires_human_review: bool = False,
    risk_level: Optional[str] = None,
) -> dict:
    """Seal a decision: create Decision + terminal status + AuditRecord (hash chain).

    Mirrors the previous ``POST /complete`` behaviour exactly, but is callable from
    the agent runtime and seed loader too.
    """
    if is_sealed(db, task_id):
        raise PermissionError("SEALED")

    task = db.query(Task).filter(Task.task_id == task_id).first()
    if not task:
        raise LookupError("TASK_NOT_FOUND")

    now = utcnow()
    decision = Decision(
        decision_id=new_uuid(),
        task_id=task_id,
        outcome=outcome,
        outcome_summary=outcome_summary,
        structured_rationale=structured_rationale,
        alternatives_considered=alternatives_considered,
        confidence_score=confidence_score,
        decided_at=now,
    )
    db.add(decision)

    if risk_level:
        task.risk_level = risk_level

    if requires_human_review:
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
            summary=outcome_summary,
            actor="agent",
        )
    )
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

    task.completed_at = now

    # Seal last so the snapshot captures every event, including record_sealed.
    audit = seal_record(db, task, decision)

    db.commit()
    emit_event("status_changed", task_id=task_id, case_id=task.case_id, status=task.status)
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
