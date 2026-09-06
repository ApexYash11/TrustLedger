import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import AuditRecord, Decision, DecisionEvent, Task, new_uuid, utcnow
from app.routes.decisions import delete_decision

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=True, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def agent_id():
    resp = client.post(
        "/api/v1/agents",
        json={"name": "ResearchAgent", "version": "1.2.0", "domain": "deloitte_client_research"},
    )
    return resp.json()["agent_id"]


def _start_task(agent_id):
    return client.post(
        "/api/v1/decisions/start",
        json={
            "agent_id": agent_id,
            "case_id": "RES-2026-004821",
            "case_type": "Market Entry Assessment — EV Charging",
            "inputs": {
                "client_name": "Tata Power",
                "engagement_code": "ENG-2026-TP-018",
                "research_question": "Enter the Rajasthan EV fast-charging market?",
            },
        },
    )


def _log_events(task_id):
    client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={"event_type": "data_retrieved", "summary": "Client financials and market reports retrieved"},
    )
    client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={
            "event_type": "clause_identified",
            "summary": "Methodology Section 5.3 — Market Entry Evidence Thresholds identified",
            "details": {
                "policy_reference": {
                    "policy_code": "DEL-RM-2026",
                    "section": "Section 5.3",
                    "title": "Market Entry Evidence Thresholds",
                    "text_excerpt": "A market entry recommendation requires three independent demand-side sources and a validated competitor cost baseline...",
                    "application": "Competitor cost baseline fails the validation threshold",
                }
            },
        },
    )
    client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={
            "event_type": "evidence_evaluated",
            "summary": "Third-party market outlook evaluated",
            "details": {
                "evidence": {
                    "evidence_type": "third_party_report",
                    "title": "EV Charging Infrastructure Outlook 2026",
                    "source": "BloombergNEF (licensed)",
                    "content_summary": "34% CAGR forecast for western India.",
                    "relevance": "Primary demand-side source",
                }
            },
        },
    )


def _complete(task_id):
    return client.post(
        f"/api/v1/decisions/{task_id}/complete",
        json={
            "outcome": "recommended_with_caveats",
            "outcome_summary": "Conditional recommendation: phased pilot entry; 2 of 3 risk factors unresolved",
            "structured_rationale": {
                "primary_reason": "Demand-side evidence supports a pilot; competitor cost baseline fails Section 5.3 validation",
                "supporting_factors": ["Three demand-side sources agree"],
                "policy_basis": ["pol-ref-001"],
                "evidence_basis": ["ev-001"],
                "exclusions_applied": ["Section 5.3: full-scale entry deferred"],
            },
            "alternatives_considered": [{"outcome": "not_recommended", "reason_rejected": "Demand-side evidence is strong"}],
            "confidence_score": 0.87,
            "requires_human_review": True,
            "risk_level": "high",
        },
    )


def test_full_lifecycle_and_verify(agent_id):
    resp = _start_task(agent_id)
    assert resp.status_code == 200
    task_id = resp.json()["task_id"]
    assert resp.json()["status"] == "running"

    ev = client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={"event_type": "policy_retrieved", "summary": "Methodology DEL-RM-2026 loaded"},
    )
    assert ev.status_code == 200
    assert ev.json()["sequence"] == 2

    _log_events(task_id)

    done = _complete(task_id)
    assert done.status_code == 200
    body = done.json()
    assert body["status"] == "review_required"
    audit = body["audit_record"]
    assert len(audit["record_hash"]) == 64

    record = client.get(f"/api/v1/decisions/{task_id}")
    assert record.status_code == 200
    rec = record.json()
    assert rec["task"]["case_id"] == "RES-2026-004821"
    assert len(rec["evidence"]) == 1
    assert len(rec["policy_references"]) == 1
    assert rec["decision"]["outcome"] == "recommended_with_caveats"

    sequences = [e["sequence"] for e in rec["events"]]
    assert sequences == sorted(sequences)
    assert len(sequences) == len(set(sequences)), "duplicate event sequences"

    verify = client.get(f"/api/v1/decisions/{task_id}/verify").json()
    assert verify["verified"] is True
    assert verify["chain_status"] == "intact"

    replay = client.get(f"/api/v1/decisions/{task_id}/replay").json()
    assert replay["case_id"] == "RES-2026-004821"
    assert len(replay["replay_steps"]) > 5
    assert replay["final_decision"]["outcome"] == "recommended_with_caveats"
    assert replay["integrity"]["verified"] is True


def test_tampered_record_fails_verification(agent_id):
    task_id = _start_task(agent_id).json()["task_id"]
    _log_events(task_id)
    _complete(task_id)

    from tests.conftest_helpers import tamper_snapshot

    tamper_snapshot(TestingSessionLocal, task_id)

    verify = client.get(f"/api/v1/decisions/{task_id}/verify").json()
    assert verify["verified"] is False
    assert verify["chain_status"] == "broken"


def test_event_after_seal_conflict(agent_id):
    task_id = _start_task(agent_id).json()["task_id"]
    _log_events(task_id)
    _complete(task_id)

    resp = client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={"event_type": "data_retrieved", "summary": "late event"},
    )
    assert resp.status_code == 409


def test_delete_unsealed_task_removes_all_dependent_records(agent_id):
    task_id = _start_task(agent_id).json()["task_id"]
    db = TestingSessionLocal()
    try:
        db.add(
            Decision(
                decision_id=new_uuid(),
                task_id=task_id,
                outcome="recommended",
                outcome_summary="Unsealed draft decision",
                structured_rationale={"primary_reason": "draft"},
                decided_at=utcnow(),
            )
        )
        db.add(
            DecisionEvent(
                event_id=new_uuid(),
                task_id=task_id,
                sequence=2,
                event_type="decision_draft",
                summary="A draft decision was created",
                actor="agent",
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.delete(f"/api/v1/decisions/{task_id}")
    assert response.status_code == 204
    assert response.content == b""

    db = TestingSessionLocal()
    try:
        assert db.query(Task).filter_by(task_id=task_id).count() == 0
        assert db.query(Decision).filter_by(task_id=task_id).count() == 0
        assert db.query(DecisionEvent).filter_by(task_id=task_id).count() == 0
        assert db.query(AuditRecord).filter_by(task_id=task_id).count() == 0
    finally:
        db.close()


def test_delete_sealed_task_returns_conflict_without_changing_records(agent_id):
    task_id = _start_task(agent_id).json()["task_id"]
    _log_events(task_id)
    _complete(task_id)

    response = client.delete(f"/api/v1/decisions/{task_id}")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "TASK_SEALED"

    db = TestingSessionLocal()
    try:
        assert db.query(Task).filter_by(task_id=task_id).count() == 1
        assert db.query(Decision).filter_by(task_id=task_id).count() == 1
        assert db.query(DecisionEvent).filter_by(task_id=task_id).count() > 0
        assert db.query(AuditRecord).filter_by(task_id=task_id).count() == 1
    finally:
        db.close()


def test_delete_rolls_back_when_the_transaction_fails(agent_id, monkeypatch):
    task_id = _start_task(agent_id).json()["task_id"]
    db = TestingSessionLocal()
    try:
        db.add(
            Decision(
                decision_id=new_uuid(),
                task_id=task_id,
                outcome="recommended",
                outcome_summary="Unsealed draft decision",
                structured_rationale={"primary_reason": "draft"},
                decided_at=utcnow(),
            )
        )
        db.commit()

        def failing_commit():
            raise SQLAlchemyError("simulated transaction failure")

        monkeypatch.setattr(db, "commit", failing_commit)
        with pytest.raises(SQLAlchemyError, match="simulated transaction failure"):
            delete_decision(task_id, db)

        assert db.query(Task).filter_by(task_id=task_id).count() == 1
        assert db.query(Decision).filter_by(task_id=task_id).count() == 1
        assert db.query(DecisionEvent).filter_by(task_id=task_id).count() == 1
    finally:
        db.close()


def test_delete_unknown_task_returns_not_found():
    response = client.delete("/api/v1/decisions/not-a-task")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "TASK_NOT_FOUND"


def test_complete_requires_rationale_fields(agent_id):
    task_id = _start_task(agent_id).json()["task_id"]
    resp = client.post(
        f"/api/v1/decisions/{task_id}/complete",
        json={"outcome": "approved", "outcome_summary": "ok", "structured_rationale": {}},
    )
    assert resp.status_code == 422


def test_unknown_agent_404():
    resp = _start_task("nonexistent-agent")
    assert resp.status_code == 404


def test_list_decisions_filters(agent_id):
    t1 = _start_task(agent_id).json()["task_id"]
    _log_events(t1)
    _complete(t1)
    listing = client.get("/api/v1/decisions", params={"status": "review_required"}).json()
    assert listing["total"] >= 1
    assert any(d["task_id"] == t1 for d in listing["decisions"])

    empty = client.get("/api/v1/decisions", params={"status": "queued"}).json()
    assert empty["total"] == 0


def test_chain_verify_all(agent_id):
    ids = []
    for _ in range(3):
        tid = _start_task(agent_id).json()["task_id"]
        _log_events(tid)
        _complete(tid)
        ids.append(tid)
    result = client.get("/api/v1/decisions/chain/verify").json()
    assert result["verified"] is True
    assert result["total_records"] == 3
