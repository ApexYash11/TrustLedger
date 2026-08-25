from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Agent, AuditRecord, Decision, DecisionEvent, Task
from .hash_chain import GENESIS, compute_record_hash


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def extract_evidence_and_policies(events: list[DecisionEvent]):
    evidence = []
    policies = []
    ev_n = 0
    pol_n = 0
    for event in events:
        details = event.details or {}
        ev = details.get("evidence")
        if isinstance(ev, dict):
            ev_n += 1
            evidence.append(
                {
                    "evidence_id": ev.get("evidence_id", f"ev-{ev_n:03d}"),
                    "evidence_type": ev.get("evidence_type", "document"),
                    "title": ev.get("title", "Untitled evidence"),
                    "source": ev.get("source", "unknown"),
                    "content_summary": ev.get("content_summary", ""),
                    "relevance": ev.get("relevance"),
                    "retrieved_at": _iso(event.timestamp),
                }
            )
        pol = details.get("policy_reference")
        if isinstance(pol, dict):
            pol_n += 1
            policies.append(
                {
                    "policy_id": pol.get("policy_id", f"pol-ref-{pol_n:03d}"),
                    "policy_code": pol.get("policy_code", ""),
                    "section": pol.get("section", ""),
                    "title": pol.get("title", ""),
                    "text_excerpt": pol.get("text_excerpt", ""),
                    "application": pol.get("application", ""),
                }
            )
    return evidence, policies


def build_snapshot(db: Session, task: Task, decision: Decision) -> dict:
    events = (
        db.query(DecisionEvent)
        .filter(DecisionEvent.task_id == task.task_id)
        .order_by(DecisionEvent.sequence)
        .all()
    )
    agent = db.query(Agent).filter(Agent.agent_id == task.agent_id).first()
    evidence, policies = extract_evidence_and_policies(events)

    snapshot = {
        "task": {
            "task_id": task.task_id,
            "case_id": task.case_id,
            "case_type": task.case_type,
            "agent_id": task.agent_id,
            "status": task.status,
            "risk_level": task.risk_level,
            "human_review_status": task.human_review_status,
            "inputs": task.inputs,
            "created_at": _iso(task.created_at),
            "started_at": _iso(task.started_at) if task.started_at else None,
            "completed_at": _iso(task.completed_at) if task.completed_at else None,
        },
        "agent": {
            "agent_id": agent.agent_id,
            "name": agent.name,
            "version": agent.version,
            "domain": agent.domain,
        }
        if agent
        else None,
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
        "decision": {
            "decision_id": decision.decision_id,
            "task_id": decision.task_id,
            "outcome": decision.outcome,
            "outcome_summary": decision.outcome_summary,
            "structured_rationale": decision.structured_rationale,
            "alternatives_considered": decision.alternatives_considered,
            "confidence_score": decision.confidence_score,
            "decided_at": _iso(decision.decided_at),
        },
    }
    return snapshot


def latest_audit_record(db: Session) -> AuditRecord | None:
    return db.query(AuditRecord).order_by(AuditRecord.chain_sequence.desc()).first()


def seal_record(db: Session, task: Task, decision: Decision) -> AuditRecord:
    """Assemble snapshot, append to hash chain, persist AuditRecord.

    Note: chain-head allocation (latest record -> previous_hash) is not serialized
    across concurrent writers. Safe for the single-user demo; concurrent completions
    would need row locking or a retry on the chain_sequence unique constraint.
    """
    previous = latest_audit_record(db)
    previous_hash = previous.record_hash if previous else GENESIS
    chain_sequence = (previous.chain_sequence + 1) if previous else 0

    snapshot = build_snapshot(db, task, decision)
    record_hash = compute_record_hash(snapshot, previous_hash)

    audit = AuditRecord(
        task_id=task.task_id,
        record_hash=record_hash,
        previous_hash=previous_hash,
        record_snapshot=snapshot,
        sealed_at=decision.decided_at,
        chain_sequence=chain_sequence,
    )
    db.add(audit)
    return audit
