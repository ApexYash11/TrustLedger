"""Seed the TrustLedger database with synthetic demo decision records.

Usage:
    python -m seed.load_demo_data          # seed (refuses if data exists)
    python -m seed.load_demo_data --force  # wipe and reseed

Produces 26 research tasks across all Kanban columns, including the hero case
RES-2026-004821 and one pre-tampered record RES-2026-009999 for the
integrity-fail demo. Prints a verification report at the end.
"""
import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import func

from app.db import Base, SessionLocal, engine
from app.models import Agent, AuditRecord, Decision, DecisionEvent, Task, utcnow
from app.services.hash_chain import verify_record_hash
from app.services.sealer import seal_record

SEED_FILE = Path(__file__).parent / "demo_data.json"

GENERATED_COMPLETED = 13
GENERATED_QUEUED = 4
GENERATED_RUNNING = 4

# Templates for generated completed cases (varied outcomes for Kanban realism)
QUICK_TEMPLATES = [
    {"case_id": "RES-2026-005310", "case_type": "Market Scan — FMCG Snacking", "client": "Hindustan Unilever",
     "risk": "low", "outcome": "recommended",
     "summary": "Recommended: enter the premium snacking segment; category growing 14% YoY across all panels."},
    {"case_id": "RES-2026-005428", "case_type": "Vendor Risk Assessment — Cloud Migration", "client": "Flipkart",
     "risk": "medium", "outcome": "recommended_with_caveats",
     "summary": "Recommended with caveats: proceed with the shorter-listed vendor; data-residency certification still pending."},
    {"case_id": "RES-2026-005455", "case_type": "Regulatory Scan — Data Privacy", "client": "PayZippy",
     "risk": "medium", "outcome": "not_recommended",
     "summary": "Not recommended: launch the wallet feature only after DPDP compliance sign-off; current flow breaches consent norms."},
    {"case_id": "RES-2026-005501", "case_type": "Cost Optimization Study — Manufacturing", "client": "Royal Enfield",
     "risk": "low", "outcome": "recommended",
     "summary": "Recommended: adopt the two-shift layout; validated ₹3.4 crore annual saving with no capex."},
    {"case_id": "RES-2026-005566", "case_type": "ESG Disclosure Readiness — Cement", "client": "Dalmia Bharat",
     "risk": "medium", "outcome": "recommended",
     "summary": "Recommended: FY27 BRSR disclosures are achievable with the proposed emissions data pipeline."},
    {"case_id": "RES-2026-005602", "case_type": "Cyber Risk Assessment — Insurance", "client": "ICICI Lombard",
     "risk": "high", "outcome": "escalated",
     "summary": "Escalated: conflicting findings on third-party API exposure; routed for partner review before the report is issued.",
     "review": True},
    {"case_id": "RES-2026-005615", "case_type": "Cross-Border Tax Advisory — Entity Restructuring", "client": "Infosys",
     "risk": "high", "outcome": "escalated",
     "summary": "Escalated: transfer pricing benchmark exceeds arm's length range; partner review required before filing.",
     "review": True},
    {"case_id": "RES-2026-005644", "case_type": "Pricing Analysis — Quick Commerce", "client": "Zepto",
     "risk": "low", "outcome": "recommended",
     "summary": "Recommended: 6-minute delivery fee of ₹19 maximizes retention without breaching the ₹24 competitor band."},
    {"case_id": "RES-2026-005650", "case_type": "Supply Chain Resilience — Semiconductors", "client": "Vedanta",
     "risk": "medium", "outcome": "recommended_with_caveats",
     "summary": "Recommended with caveats: dual-sourcing strategy satisfies SLA; fab timeline has 4-month variance."},
    {"case_id": "RES-2026-005662", "case_type": "Workplace Policy Scan — Hybrid Norms", "client": "Wipro",
     "risk": "low", "outcome": "recommended",
     "summary": "Recommended: 3-day office cadence aligns with peer index across Tier-1 tech firms."},
    {"case_id": "RES-2026-005675", "case_type": "Capital Allocation Strategy — Green Energy", "client": "Adani Green",
     "risk": "low", "outcome": "recommended",
     "summary": "Recommended: allocate 40% capex to hybrid solar-wind clusters; exceeds hurdle rate by 180 bps."},
    {"case_id": "RES-2026-005688", "case_type": "Credit Risk Model Validation — Retail NBFC", "client": "Bajaj Finance",
     "risk": "medium", "outcome": "recommended",
     "summary": "Recommended: Tier-2 bureau score uplift validates default probability calibration."},
    {"case_id": "RES-2026-005695", "case_type": "Brand Perception Due Diligence — D2C Acquisition", "client": "Mamaearth",
     "risk": "medium", "outcome": "not_recommended",
     "summary": "Not recommended: brand sentiment dropped 38% post-recall; customer acquisition cost unsustainable."},
]

RUNNING_PARTIALS = [
    {"case_id": "RES-2026-005701", "case_type": "M&A Screening — Logistics Target", "client": "Mahindra Electric",
     "engagement_code": "ENG-2026-ME-009",
     "events": [
         ("data_retrieved", "Client mandate and target data pack retrieved", "agent"),
         ("policy_retrieved", "Methodology DEL-RM-2026 loaded", "agent"),
         ("evidence_evaluated", "Awaiting data room access for financial folder", "system"),
     ]},
    {"case_id": "RES-2026-005718", "case_type": "Regulatory Scan — Lending Norms", "client": "Ola Financial Services",
     "engagement_code": "ENG-2026-OF-004",
     "events": [
         ("data_retrieved", "RBI circular set verified current", "agent"),
         ("evidence_evaluated", "State-norms comparison table downloading, evaluation in progress", "system"),
     ]},
    {"case_id": "RES-2026-005735", "case_type": "Anti-Money Laundering Rule Tuning", "client": "HDFC Bank",
     "engagement_code": "ENG-2026-HB-012",
     "events": [
         ("data_retrieved", "Transaction monitoring thresholds retrieved", "agent"),
         ("evidence_evaluated", "False positive reduction analysis in progress", "system"),
     ]},
    {"case_id": "RES-2026-005749", "case_type": "Carbon Offset Integrity Audit", "client": "Jindal Steel",
     "engagement_code": "ENG-2026-JS-007",
     "events": [
         ("data_retrieved", "Registry verification logs downloaded", "agent"),
         ("policy_retrieved", "Methodology DEL-RM-2026 Section 4.1 loaded", "agent"),
     ]},
]

QUEUED_CASES = [
    {"case_id": "RES-2026-005801", "case_type": "Market Entry Study — Quick Commerce", "client": "Blinkit",
     "engagement_code": "ENG-2026-BK-006", "offset_min": 12},
    {"case_id": "RES-2026-005814", "case_type": "Due Diligence — Fintech Target", "client": "Razorpay",
     "engagement_code": "ENG-2026-RP-001", "offset_min": 8},
    {"case_id": "RES-2026-005827", "case_type": "Corporate Governance Benchmark", "client": "Larsen & Toubro",
     "engagement_code": "ENG-2026-LT-003", "offset_min": 5},
    {"case_id": "RES-2026-005839", "case_type": "Post-Merger Synergy Realization", "client": "Air India",
     "engagement_code": "ENG-2026-AI-005", "offset_min": 2},
]


def ensure_agent(db: SessionLocal) -> Agent:
    agent = db.query(Agent).filter(Agent.name == "ResearchAgent").first()
    if agent:
        return agent
    agent = Agent(
        name="ResearchAgent",
        version="1.2.0",
        domain="deloitte_client_research",
        description="Simulated Deloitte client research agent",
    )
    db.add(agent)
    db.commit()
    return agent


def _add_event(db, task, seq, event_type, summary, actor="agent", details=None, ts=None):
    db.add(
        DecisionEvent(
            event_id=None,
            task_id=task.task_id,
            sequence=seq,
            event_type=event_type,
            summary=summary,
            details=details,
            actor=actor,
            timestamp=ts or utcnow(),
        )
    )


def _seed_scenario(db, agent, sc, base):
    """Full lifecycle for a hand-crafted scenario (completed / review_required / tampered)."""
    task = Task(
        case_id=sc["case_id"],
        case_type=sc["case_type"],
        agent_id=agent.agent_id,
        status="running",
        risk_level=sc.get("risk_level"),
        inputs=sc["inputs"],
        created_at=base,
        started_at=base + timedelta(seconds=2),
    )
    db.add(task)
    db.flush()

    _add_event(db, task, 1, "case_received",
               f"Research task {sc['case_id']} received for automated processing", actor="system",
               ts=base + timedelta(seconds=2))

    seq = 2
    for ev in sc["events"]:
        details = dict(ev.get("details") or {})
        if "evidence" in ev:
            details["evidence"] = ev["evidence"]
        if "policy_reference" in ev:
            details["policy_reference"] = ev["policy_reference"]
        _add_event(db, task, seq, ev["event_type"], ev["summary"], actor=ev.get("actor", "agent"),
                   details=details or None,
                   ts=base + timedelta(seconds=2 + seq * 4))
        seq += 1

    d = sc["decision"]
    review = sc.get("requires_human_review", False)
    decision = Decision(
        task_id=task.task_id,
        outcome=d["outcome"],
        outcome_summary=d["outcome_summary"],
        structured_rationale=d["structured_rationale"],
        alternatives_considered=d.get("alternatives_considered"),
        confidence_score=d.get("confidence_score"),
        decided_at=base + timedelta(seconds=2 + seq * 4),
    )
    db.add(decision)

    if review:
        task.status = "review_required"
        task.human_review_status = "triggered"
        _add_event(db, task, seq, "human_review_triggered",
                   "High-value or flagged case routed for human review", actor="system",
                   details={"trigger_reason": "requires_human_review"},
                   ts=base + timedelta(seconds=2 + seq * 4))
        seq += 1
    else:
        task.status = "completed"
        task.human_review_status = "not_required"

    _add_event(db, task, seq, "decision_generated", d["outcome_summary"], actor="agent",
               ts=base + timedelta(seconds=2 + seq * 4))
    seq += 1

    task.completed_at = base + timedelta(seconds=2 + seq * 4)
    db.flush()

    audit = seal_record(db, task, decision)

    _add_event(db, task, seq, "record_sealed", "Decision record sealed and hash-chained",
               actor="system", ts=base + timedelta(seconds=2 + seq * 4))
    db.commit()
    return task, audit


def _seed_quick_completed(db, agent, tpl, base):
    """Template-driven completed case with a compact event set."""
    task = Task(
        case_id=tpl["case_id"],
        case_type=tpl["case_type"],
        agent_id=agent.agent_id,
        status="running",
        risk_level=tpl["risk"],
        inputs={
            "client_name": tpl["client"],
            "engagement_code": f"ENG-2026-{tpl['case_id'][-3:]}-X",
            "research_question": tpl["summary"].split(": ", 1)[-1],
        },
        created_at=base,
        started_at=base + timedelta(seconds=1),
    )
    db.add(task)
    db.flush()

    events = [
        ("data_retrieved", f"Client brief and data sources for {tpl['client']} retrieved", "agent"),
        ("policy_retrieved", "Methodology DEL-RM-2026 loaded", "agent"),
        ("clause_identified", "Applicable methodology sections identified", "agent"),
        ("evidence_evaluated", "Supporting sources evaluated and reconciled", "agent"),
    ]
    for i, (etype, summary, actor) in enumerate(events, start=2):
        _add_event(db, task, i, etype, summary, actor=actor, ts=base + timedelta(seconds=i * 3))

    seq = len(events) + 2
    review = bool(tpl.get("review"))
    rationale = {
        "primary_reason": tpl["summary"].split(": ", 1)[-1],
        "supporting_factors": ["Sources triangulated within methodology thresholds", "No open independence or conflict findings"],
        "policy_basis": [],
        "evidence_basis": [],
        "exclusions_applied": [],
    }
    decision = Decision(
        task_id=task.task_id,
        outcome="escalated" if review else tpl["outcome"],
        outcome_summary=tpl["summary"],
        structured_rationale=rationale,
        alternatives_considered=[],
        confidence_score=0.85,
        decided_at=base + timedelta(seconds=seq * 3),
    )
    db.add(decision)

    if review:
        task.status = "review_required"
        task.human_review_status = "triggered"
        _add_event(db, task, seq, "human_review_triggered", "Conflicting findings flagged for human review",
                   actor="system", ts=base + timedelta(seconds=seq * 3))
        seq += 1
    else:
        task.status = "completed"
        task.human_review_status = "not_required"

    _add_event(db, task, seq, "decision_generated", tpl["summary"], actor="agent",
               ts=base + timedelta(seconds=seq * 3))
    seq += 1
    task.completed_at = base + timedelta(seconds=seq * 3)
    db.flush()

    audit = seal_record(db, task, decision)
    _add_event(db, task, seq, "record_sealed", "Decision record sealed and hash-chained",
               actor="system", ts=base + timedelta(seconds=seq * 3))
    db.commit()


def _seed_running(db, agent, spec, base):
    task = Task(
        case_id=spec["case_id"],
        case_type=spec["case_type"],
        agent_id=agent.agent_id,
        status="running",
        inputs={"client_name": spec["client"], "engagement_code": spec["engagement_code"]},
        created_at=base,
        started_at=base + timedelta(seconds=1),
    )
    db.add(task)
    db.flush()
    _add_event(db, task, 1, "case_received", f"Research task {spec['case_id']} received for automated processing",
               actor="system", ts=base + timedelta(seconds=1))
    for i, (etype, summary, actor) in enumerate(spec["events"], start=2):
        _add_event(db, task, i, etype, summary, actor=actor, ts=base + timedelta(seconds=i * 5))
    db.commit()


def _seed_queued(db, agent, case_id, case_type, client, engagement_code, base):
    task = Task(
        case_id=case_id,
        case_type=case_type,
        agent_id=agent.agent_id,
        status="queued",
        inputs={"client_name": client, "engagement_code": engagement_code},
        created_at=base,
        started_at=None,
    )
    db.add(task)
    db.commit()


def _tamper_case(db, case_id):
    """Post-seal DB edit — the integrity-fail demo record."""
    audit = (
        db.query(AuditRecord)
        .join(Task, AuditRecord.task_id == Task.task_id)
        .filter(Task.case_id == case_id)
        .first()
    )
    snapshot = dict(audit.record_snapshot)
    decision = dict(snapshot["decision"])
    original = decision["outcome_summary"]
    decision["outcome_summary"] = original.replace(
        "2 of 5 diligence red flags unresolved; partner sign-off required before contract award",
        "0 of 5 diligence red flags unresolved; cleared for immediate contract award",
    )
    decision["outcome"] = "recommended"
    snapshot["decision"] = decision
    audit.record_snapshot = snapshot
    db.commit()
    return original, decision["outcome_summary"]


def _verify_report(db):
    records = db.query(AuditRecord).order_by(AuditRecord.chain_sequence).all()
    print("\n=== Integrity Verification Report ===")
    ok_count = 0
    broken = []
    previous_hash = "GENESIS"
    for rec in records:
        case = db.query(Task).filter(Task.task_id == rec.task_id).first().case_id
        ok_hash = verify_record_hash(rec.record_snapshot, rec.previous_hash, rec.record_hash)
        ok_link = rec.previous_hash == previous_hash
        previous_hash = rec.record_hash
        if ok_hash and ok_link:
            ok_count += 1
            print(f"  [OK]      #{rec.chain_sequence:<3} {case}")
        else:
            reason = "hash mismatch" if not ok_hash else "broken link"
            broken.append(case)
            print(f"  [TAMPERED] #{rec.chain_sequence:<3} {case} ({reason})")
    total = len(records)
    print(f"\n{ok_count}/{total} sealed records intact; {len(broken)} tampered.")
    if broken:
        print(f"Tampered demo records: {', '.join(broken)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="wipe all tables and reseed")
    args = parser.parse_args()

    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))

    if args.force:
        Base.metadata.drop_all(bind=engine)

    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        existing = db.query(func.count(Task.task_id)).scalar()
        if existing:
            print(f"Database already contains {existing} tasks. Use --force to wipe and reseed.")
            sys.exit(1)

        agent = ensure_agent(db)
        scenarios = data["scenarios"]
        now = utcnow()
        base = now - timedelta(days=3)

        print(f"Seeding {len(scenarios)} hand-crafted scenarios...")
        hero = None
        for i, sc in enumerate(scenarios):
            t, a = _seed_scenario(db, agent, sc, base + timedelta(hours=i * 3))
            target = sc.get("status_target")
            label = "tampered_completed" if target == "tampered_completed" else t.status
            print(f"  {t.case_id}: {t.status}" + (" (will be tampered)" if target == "tampered_completed" else ""))
            if t.case_id == "RES-2026-004821":
                hero = t.case_id

        print(f"Generating {GENERATED_COMPLETED} quick completed cases...")
        for j, tpl in enumerate(QUICK_TEMPLATES):
            _seed_quick_completed(db, agent, tpl, now - timedelta(days=1) + timedelta(minutes=j * 17))
        print("  done.")

        print(f"Generating {GENERATED_RUNNING} running tasks...")
        for j, spec in enumerate(RUNNING_PARTIALS):
            _seed_running(db, agent, spec, now - timedelta(minutes=40 - j * 10))
        print("  done.")

        print(f"Generating {GENERATED_QUEUED} queued tasks...")
        for qc in QUEUED_CASES:
            _seed_queued(db, agent, qc["case_id"], qc["case_type"], qc["client"], qc["engagement_code"], now - timedelta(minutes=qc["offset_min"]))
        print("  done.")

        print("\nTampering RES-2026-009999 post-seal (integrity fail demo)...")
        orig, fake = _tamper_case(db, "RES-2026-009999")
        print(f'  outcome_summary: "{orig[:40]}..." -> "{fake[:40]}..."')

        counts = {}
        for t in db.query(Task).all():
            counts[t.status] = counts.get(t.status, 0) + 1
        print("\n=== Task Summary ===")
        for status, n in sorted(counts.items()):
            print(f"  {status}: {n}")
        print(f"  total: {sum(counts.values())}")

        _verify_report(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
