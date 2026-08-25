from app.models import AuditRecord


def tamper_snapshot(SessionLocal, task_id: str):
    """Simulate a post-seal DB edit — the demo tamper scenario."""
    db = SessionLocal()
    try:
        audit = db.query(AuditRecord).filter(AuditRecord.task_id == task_id).first()
        snapshot = dict(audit.record_snapshot)
        decision = dict(snapshot["decision"])
        decision["outcome_summary"] = "Full approval: $18,000 of $18,000 claimed"
        snapshot["decision"] = decision
        audit.record_snapshot = snapshot
        db.commit()
    finally:
        db.close()
