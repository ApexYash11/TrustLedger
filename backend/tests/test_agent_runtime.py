"""Tests for the agent runtime / dispatcher and queue/claim/SSE endpoints (issue #12)
and the integrity invariant on status PATCH (issue #15).
"""
import pytest
from fastapi.testclient import TestClient

from app.models import AuditRecord, Decision, Task
from tests.test_api_flow import client, setup_db, agent_id  # reuse fixtures/app


def _start(agent_id, case="RES-QUEUE-001"):
    return client.post(
        "/api/v1/decisions/start",
        json={
            "agent_id": agent_id,
            "case_id": case,
            "case_type": "Market Entry — Test",
            "inputs": {"client_name": "ACME"},
        },
    ).json()["task_id"]


def _queue(agent_id, case="RES-QUEUE-002"):
    return client.post(
        "/api/v1/decisions/queue",
        json={
            "agent_id": agent_id,
            "case_id": case,
            "case_type": "Regulatory Scan — Test",
            "inputs": {"client_name": "ACME"},
        },
    )


def test_status_patch_to_terminal_is_rejected(agent_id):
    """Issue #15 — manual PATCH cannot push an unsealed task to a terminal state."""
    task_id = _start(agent_id)
    for terminal in ("completed", "review_required"):
        resp = client.patch(f"/api/v1/decisions/{task_id}/status", json={"status": terminal})
        assert resp.status_code == 409, f"{terminal} should be rejected"
        assert resp.json()["detail"]["code"] == "TASK_NOT_SEALED"


def test_status_patch_non_terminal_allowed(agent_id):
    """Issue #15 — dragging a card between non-terminal lanes still works."""
    task_id = _start(agent_id)
    resp = client.patch(f"/api/v1/decisions/{task_id}/status", json={"status": "queued"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"


def test_complete_still_seals_and_passes_verify(agent_id):
    """Issue #15 — the only path to a terminal state seals a chain-record."""
    task_id = _start(agent_id)
    client.post(
        f"/api/v1/decisions/{task_id}/events",
        json={"event_type": "data_retrieved", "summary": "sourced"},
    )
    resp = client.post(
        f"/api/v1/decisions/{task_id}/complete",
        json={
            "outcome": "recommended",
            "outcome_summary": "ok",
            "structured_rationale": {
                "primary_reason": "fit",
                "supporting_factors": [],
                "policy_basis": [],
                "evidence_basis": [],
                "exclusions_applied": [],
            },
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
    assert resp.json()["audit_record"]["record_hash"]
    verify = client.get(f"/api/v1/decisions/{task_id}/verify").json()
    assert verify["verified"] is True


def test_queue_then_claim(agent_id):
    """Issue #12 — a queued card is claimed and moved to running."""
    resp = _queue(agent_id)
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"
    task_id = resp.json()["task_id"]

    claim = client.post("/api/v1/decisions/claim")
    assert claim.status_code == 200
    assert claim.json()["task_id"] == task_id
    assert claim.json()["status"] == "running"


def test_claim_with_no_queue_404(agent_id):
    resp = client.post("/api/v1/decisions/claim")
    assert resp.status_code == 404


def test_agents_list_and_idempotent_register(agent_id):
    """Issue #12 — GET /agents lists; re-register returns the same agent_id."""
    resp = client.get("/api/v1/agents")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    again = client.post(
        "/api/v1/agents",
        json={"name": "ResearchAgent", "version": "1.2.0", "domain": "deloitte_client_research"},
    )
    assert again.status_code == 200
    assert again.json()["agent_id"] == agent_id


def test_dispatcher_processes_queued_task(agent_id):
    """Issue #12 — the runtime claims + processes a queued card to a sealed terminal state."""
    from agents.runtime import claim_and_process_one
    from tests.test_api_flow import TestingSessionLocal

    _queue(agent_id, case="RES-DISPATCH-1")
    db = TestingSessionLocal()
    try:
        case = claim_and_process_one(db)
        assert case == "RES-DISPATCH-1"
    finally:
        db.close()

    task = client.get("/api/v1/decisions", params={"case_id": "RES-DISPATCH-1"}).json()["decisions"][0]
    assert task["status"] in ("completed", "review_required")
    assert task["outcome"] is not None  # a sealed decision exists