from sqlalchemy.orm import Session

from ..models import Decision, DecisionEvent, Task
from .sealer import extract_evidence_and_policies

EVENT_TYPE_TITLES = {
    "case_received": "Research Task Received",
    "data_retrieved": "Data Retrieved",
    "policy_retrieved": "Methodology Loaded",
    "clause_identified": "Applicable Standard Identified",
    "evidence_evaluated": "Source Evaluated",
    "decision_generated": "Recommendation Generated",
    "human_review_triggered": "Human Review Triggered",
    "human_review_completed": "Human Review Completed",
    "record_sealed": "Record Sealed",
}


def build_replay(db: Session, task: Task, decision: Decision | None) -> dict:
    events = (
        db.query(DecisionEvent)
        .filter(DecisionEvent.task_id == task.task_id)
        .order_by(DecisionEvent.sequence)
        .all()
    )
    _, policies = extract_evidence_and_policies(events)

    steps = []
    for i, event in enumerate(events, start=1):
        details = event.details or {}
        step_evidence = []
        ev = details.get("evidence")
        if isinstance(ev, dict):
            step_evidence.append({"title": ev.get("title"), "summary": ev.get("content_summary")})
        step_policies = []
        pol = details.get("policy_reference")
        if isinstance(pol, dict):
            step_policies.append(
                {
                    "section": pol.get("section"),
                    "title": pol.get("title"),
                    "text_excerpt": pol.get("text_excerpt"),
                    "application": pol.get("application"),
                }
            )
        steps.append(
            {
                "step": i,
                "timestamp": event.timestamp.isoformat(),
                "title": EVENT_TYPE_TITLES.get(event.event_type, event.event_type.replace("_", " ").title()),
                "description": event.summary,
                "evidence": step_evidence,
                "policies": step_policies,
            }
        )

    final_decision = None
    if decision:
        final_decision = {
            "outcome": decision.outcome,
            "summary": decision.outcome_summary,
            "rationale": decision.structured_rationale,
        }

    return {"task_id": task.task_id, "case_id": task.case_id, "steps": steps, "final_decision": final_decision}
