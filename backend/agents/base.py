"""Agent contract for the TrustLedger runtime (issue #12).

A ``DiveAgent`` performs a task by streaming ledger events as it works: each
logical step becomes a ``decision_event`` + status update, so the card animates
through the Kanban lanes in real time and lands in ``completed`` / ``review_required``
with a fully sealed audit record — no manual replay script needed.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy.orm import Session


@dataclass
class AgentContext:
    """Everything a running agent needs: its DB session and its registered row."""
    db: Session
    agent_id: str
    name: str
    domain: str
    version: str


@dataclass
class Step:
    """One logical step the agent streams to the ledger while working."""
    event_type: str
    summary: str
    actor: str = "agent"
    details: Optional[dict] = None


@dataclass
class AgentResult:
    """Outcome of a completed task produced by an agent."""
    outcome: str
    outcome_summary: str
    structured_rationale: dict
    alternatives_considered: Optional[list] = None
    confidence_score: Optional[float] = None
    requires_human_review: bool = False
    risk_level: Optional[str] = None
    steps: list[Step] = field(default_factory=list)


class DiveAgent(ABC):
    """Contract every runtime agent implements.

    ``run`` streams the agent's work into the ledger (via the ``flow`` helper) and
    returns the decision result. The runtime calls ``run`` after claiming a task.
    """

    name: str = "DiveAgent"
    version: str = "0.0.0"
    domain: str = "generic"
    description: str = ""

    @abstractmethod
    def build_steps(self, ctx: AgentContext, task_inputs: dict) -> list[Step]:
        """Return the ordered steps the agent performs for this task."""

    @abstractmethod
    def decide(self, ctx: AgentContext, task_inputs: dict) -> AgentResult:
        """Return the final decision result after the steps have been streamed."""

    def run(self, ctx: AgentContext, task_id: str, task_inputs: dict) -> AgentResult:
        from app.services import decision_ops
        from app.services.decision_ops import append_event

        step_data = self.build_steps(ctx, task_inputs)
        for step in step_data:
            append_event(
                ctx.db,
                task_id=task_id,
                event_type=step.event_type,
                summary=step.summary,
                actor=step.actor,
                details=step.details,
            )

        result = self.decide(ctx, task_inputs)
        result.steps = step_data
        return result