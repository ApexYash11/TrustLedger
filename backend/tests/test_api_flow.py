import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app

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
        json={"name": "ClaimsReviewAgent", "version": "1.2.0", "domain": "insurance_claims"},
    )
    return resp.json()["agent_id"]


def _start_task(agent_id):
    return client.post(
        "/api/v1/decisions/start",
        json={
            "agent_id": agent_id,
            "case_id": "CLM-2026-004821",
            "case_type": "Property Damage — Water",
            "inputs": {"claimant_name": "Jane Doe", "claim_amount": 18000.0},
        },
    )


def _log_events(task_id):
    client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={"event_type": "data_retrieved", "summary": "Policy and claim history retrieved"},
    )
    client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={
            "event_type": "clause_identified",
            "summary": "Section 4.2.1 — Water Damage Exclusion identified",
            "details": {
                "policy_reference": {
                    "policy_code": "POL-8842-C",
                    "section": "Section 4.2.1",
                    "title": "Water Damage Exclusion",
                    "text_excerpt": "Coverage excludes damage caused by flood...",
                    "application": "External rainfall flooding is excluded",
                }
            },
        },
    )
    client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={
            "event_type": "evidence_evaluated",
            "summary": "Adjuster report and photos evaluated",
            "details": {
                "evidence": {
                    "evidence_type": "third_party_report",
                    "title": "Adjuster Field Report",
                    "source": "Claims Management System",
                    "content_summary": "No evidence of pipe burst.",
                    "relevance": "Determines cause of water damage",
                }
            },
        },
    )


def _complete(task_id):
    return client.post(
        f"/api/v1/decisions/{task_id}/complete",
        json={
            "outcome": "partially_approved",
            "outcome_summary": "Partial approval: $12,400 of $18,000 claimed",
            "structured_rationale": {
                "primary_reason": "Contents covered under Section 3.1; structural excluded under 4.2.1",
                "supporting_factors": ["No pipe burst evidence"],
                "policy_basis": ["pol-ref-001"],
                "evidence_basis": ["ev-001"],
                "exclusions_applied": ["Section 4.2.1 structural damage excluded"],
            },
            "alternatives_considered": [{"outcome": "full_denial", "reason_rejected": "Contents coverage applies"}],
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
        json={"event_type": "data_retrieved", "summary": "Policy retrieved"},
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
    assert rec["task"]["case_id"] == "CLM-2026-004821"
    assert len(rec["evidence"]) == 1
    assert len(rec["policy_references"]) == 1
    assert rec["decision"]["outcome"] == "partially_approved"

    sequences = [e["sequence"] for e in rec["events"]]
    assert sequences == sorted(sequences)
    assert len(sequences) == len(set(sequences)), "duplicate event sequences"

    verify = client.get(f"/api/v1/decisions/{task_id}/verify").json()
    assert verify["verified"] is True
    assert verify["chain_status"] == "intact"

    replay = client.get(f"/api/v1/decisions/{task_id}/replay").json()
    assert replay["case_id"] == "CLM-2026-004821"
    assert len(replay["replay_steps"]) > 5
    assert replay["final_decision"]["outcome"] == "partially_approved"
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
    assert all(d["status"] != "queued" or True for d in empty["decisions"])
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
