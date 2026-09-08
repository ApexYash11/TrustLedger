"""Agent dispatcher / runtime (issue #12).

A worker loop that runs in the background: it claims any ``queued`` task, looks up
the appropriate ``DiveAgent`` in the registry, and lets it stream its work into the
ledger before sealing a decision. Cards therefore appear and update live on the
Kanban without a manual replay script.

The loop runs synchronously inside a thread pool via :func:`asyncio.to_thread` so it
does not block the SSE broadcaster or the FastAPI event loop.
"""
import asyncio
import logging
from typing import Optional

from sqlalchemy.orm import Session, sessionmaker

from app.models import Agent, DecisionEvent, Task, utcnow
from app.services import decision_ops
from app.services.event_hub import emit_event

from .base import AgentContext
from .registry import get_agent

logger = logging.getLogger("trustledger.runtime")


def run_agent_on_task(db: Session, task: Task, agent) -> None:
    """Execute one agent against one claimed (running) task; seals a decision."""
    agent_row = db.query(Agent).filter(Agent.agent_id == task.agent_id).first()
    domain = agent_row.domain if agent_row else agent.domain
    ctx = AgentContext(
        db=db,
        agent_id=task.agent_id,
        name=agent.name,
        domain=domain,
        version=agent.version,
    )
    result = agent.run(ctx, task.task_id, task.inputs)
    decision_ops.complete_decision(
        db,
        task_id=task.task_id,
        outcome=result.outcome,
        outcome_summary=result.outcome_summary,
        structured_rationale=result.structured_rationale,
        alternatives_considered=result.alternatives_considered,
        confidence_score=result.confidence_score,
        requires_human_review=result.requires_human_review,
        risk_level=result.risk_level,
    )
    emit_event("task_processed", task_id=task.task_id, case_id=task.case_id, status=task.status)


def claim_and_process_one(db: Session, agent_lookup=None) -> Optional[str]:
    """Claim the oldest queued task and process it. Returns ``case_id`` or ``None``."""
    claimed = (
        db.query(Task)
        .filter(Task.status == "queued")
        .order_by(Task.created_at.asc())
        .first()
    )
    if not claimed:
        return None

    claimed.status = "running"
    claimed.started_at = utcnow()

    # Determine the agent by the task's registered domain (falls back to default).
    agent_row = db.query(Agent).filter(Agent.agent_id == claimed.agent_id).first()
    domain = agent_row.domain if agent_row else ""
    agent = (agent_lookup or get_agent)(domain)

    db.flush()
    db.add(
        DecisionEvent(
            task_id=claimed.task_id,
            sequence=decision_ops._next_sequence(db, claimed.task_id),
            event_type="case_received",
            summary=f"{agent.name} picked up task {claimed.case_id}",
            actor="system",
        )
    )
    db.commit()
    decision_ops.emit_task_status(claimed.task_id, claimed.case_id, "running")

    run_agent_on_task(db, claimed, agent)
    return claimed.case_id


def _tick(session_factory: sessionmaker) -> None:
    """Synchronous tick: claim + process at most one queued task."""
    db = session_factory()
    try:
        claim_and_process_one(db)
    except Exception:  # noqa: BLE001 - keep the dispatcher alive on agent error
        logger.exception("dispatcher tick failed")
    finally:
        db.close()


async def dispatcher_loop(session_factory: sessionmaker, poll_seconds: float = 2.0) -> None:
    """Run forever: poll for queued tasks and dispatch them to agents."""
    while True:
        await asyncio.to_thread(_tick, session_factory)
        await asyncio.sleep(poll_seconds)