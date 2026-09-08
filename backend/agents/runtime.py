"""Agent dispatcher / runtime (issue #12).

A worker loop that runs in the background: it claims any ``queued`` task, looks up
the appropriate ``DiveAgent`` in the registry, and lets it stream its work into the
ledger before sealing a decision. Cards therefore appear and update live on the
Kanban without a manual replay script.

Claiming is atomic and shared: :func:`claim_next_task` is the single claim
implementation used by both the ``POST /decisions/claim`` route and the
dispatcher. It wins a task with a conditional ``UPDATE ... WHERE status =
'queued'`` and only continues when exactly one row is affected — SQLite ignores
``FOR UPDATE SKIP LOCKED`` row locks, so a conditional update is the only gate
that works on both SQLite (tests/demo) and PostgreSQL (production).

The loop runs synchronously inside a thread pool via :func:`asyncio.to_thread` so it
does not block the SSE broadcaster or the FastAPI event loop.
"""
import asyncio
import logging
from typing import Callable, Optional, Tuple

from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from app.models import Agent, Task, utcnow
from app.services import decision_ops
from app.services.event_hub import emit_event

from .base import AgentContext
from .registry import get_agent

logger = logging.getLogger("trustledger.runtime")

#: Bounded retries when a claim is lost to a concurrent worker between the
#: SELECT and the conditional UPDATE. One iteration always makes progress
#: (the loser moves on to the next queued task), so this is a livelock guard.
MAX_CLAIM_ATTEMPTS = 10


def resolve_task_agent(
    db: Session, task: Task, agent_lookup: Optional[Callable[[str], object]] = None
) -> Tuple[object, Optional[Agent]]:
    """Resolve the DiveAgent that must run ``task``.

    The agent is chosen from the domain of the task's registered ``Agent`` row —
    never from a global default — so a task always runs under the identity it was
    queued with.

    Raises:
        LookupError: if the Agent row is missing or its domain has no registered
            implementation (strict dispatch; no silent default-agent fallback).
    """
    lookup = agent_lookup or get_agent
    agent_row = db.query(Agent).filter(Agent.agent_id == task.agent_id).first()
    domain = agent_row.domain if agent_row else ""
    return lookup(domain), agent_row


def claim_next_task(
    db: Session, agent_lookup: Optional[Callable[[str], object]] = None
) -> Optional[Tuple[Task, object]]:
    """Atomically claim the oldest queued task and return ``(task, agent)``.

    Returns ``None`` when the queue is empty, the claim is lost to a concurrent
    worker, or the task's domain has no registered agent implementation (in that
    case the task is left ``queued`` with a ``claim_skipped`` ledger note rather
    than being dispatched under the wrong agent identity).

    The claim is a conditional update from ``queued`` to ``running``: only the
    worker whose UPDATE affects exactly one row proceeds, which makes the two
    claim paths (this helper and the route that delegates to it) mutually safe.
    """
    for _ in range(MAX_CLAIM_ATTEMPTS):
        task = (
            db.query(Task)
            .filter(Task.status == "queued")
            .order_by(Task.created_at.asc(), Task.task_id.asc())
            .first()
        )
        if task is None:
            return None

        try:
            agent, _agent_row = resolve_task_agent(db, task, agent_lookup)
        except LookupError as exc:
            # Unsupported domain: skip this task but keep it queued and leave a
            # trail explaining why, instead of running it as a default agent.
            logger.warning("task %s skipped: %s", task.task_id, exc)
            decision_ops.append_event(
                db,
                task_id=task.task_id,
                event_type="claim_skipped",
                summary=f"Claim skipped: {exc}",
                actor="system",
            )
            return None

        result = db.execute(
            update(Task)
            .where(Task.task_id == task.task_id, Task.status == "queued")
            .values(status="running", started_at=utcnow())
        )
        if result.rowcount != 1:
            # Another worker claimed it between SELECT and UPDATE; try the next one.
            db.rollback()
            continue

        db.commit()
        decision_ops.append_event(
            db,
            task_id=task.task_id,
            event_type="case_received",
            summary=f"{agent.name} picked up task {task.case_id}",
            actor="system",
        )
        decision_ops.emit_task_status(task.task_id, task.case_id, "running")
        return task, agent
    return None


def _requeue_after_failure(db: Session, task: Task) -> None:
    """Return a task whose agent run failed to the ``queued`` lane for retry.

    Rolls back any partial writes from the crashed run first, then conditionally
    moves the task back to ``queued`` (only from ``running``/``queued`` — a task
    that was already sealed into a terminal state is left untouched) and notes
    the failure in the ledger. Emits the SSE status change so the Kanban card
    visibly returns to the queue instead of being stranded in ``running``.
    """
    db.rollback()  # drop any partial agent writes from the failed run
    if decision_ops.is_sealed(db, task.task_id):
        logger.warning("task %s sealed despite error; leaving terminal state intact", task.task_id)
        return
    try:
        db.execute(
            update(Task)
            .where(Task.task_id == task.task_id, Task.status.in_(("running", "queued")))
            .values(status="queued", started_at=None)
        )
        db.commit()
    except Exception:  # noqa: BLE001 - never let failure handling crash the dispatcher
        db.rollback()
        logger.exception("could not requeue task %s after failure", task.task_id)
        return
    decision_ops.append_event(
        db,
        task_id=task.task_id,
        event_type="processing_failed",
        summary="Agent run failed; task returned to the queue for retry",
        actor="system",
    )
    decision_ops.emit_task_status(task.task_id, task.case_id, "queued")




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


def claim_and_process_one(
    db: Session, agent_lookup: Optional[Callable[[str], object]] = None
) -> Optional[str]:
    """Atomically claim one queued task and run its agent to a sealed decision.

    Returns the ``case_id`` on success, or ``None`` when the queue is empty, the
    claim was lost to a concurrent worker, the agent could not be resolved, or
    the agent run failed.

    Failure semantics: an exception from the agent (or from sealing) is caught
    here — the task is rolled back to ``queued`` so a later tick retries it —
    and logged at this site, instead of leaving the card stranded in ``running``.
    """
    claimed = claim_next_task(db, agent_lookup)
    if claimed is None:
        return None
    task, agent = claimed
    try:
        run_agent_on_task(db, task, agent)
    except Exception:  # noqa: BLE001 - handled: requeue + log, dispatcher keeps running
        logger.exception("agent run failed for task %s; returned to queue", task.task_id)
        _requeue_after_failure(db, task)
        return None
    return task.case_id


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