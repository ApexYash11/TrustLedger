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

def test_queue_unsupported_domain_rejected(agent_id):
    """Issue #12 — queueing against a domain with no registered agent is a 422.

    Such a task could never be dispatched, so it must not be allowed to strand
    in the ``queued`` lane (CodeRabbit finding on PR #21).
    """
    orphan = client.post(
        "/api/v1/agents",
        json={"name": "OrphanBot", "version": "0.1.0", "domain": "no_such_domain"},
    ).json()["agent_id"]
    resp = client.post(
        "/api/v1/decisions/queue",
        json={"agent_id": orphan, "case_id": "REG-ORPHAN-1", "case_type": "X", "inputs": {}},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "NO_AGENT_IMPLEMENTATION"


def test_reregister_reconciles_version(agent_id):
    """Issue #12 — a duplicate registration refreshes stale agent metadata."""
    client.post(
        "/api/v1/agents",
        json={"name": "ResearchAgent", "version": "0.9.9", "domain": "deloitte_client_research"},
    )
    row = next(
        a for a in client.get("/api/v1/agents").json()["agents"] if a["agent_id"] == agent_id
    )
    assert row["version"] == "0.9.9"  # latest registration wins, not a stale row


def test_failed_agent_run_requeues_for_retry(agent_id):
    """Issue #12/PR #21 — a crashed agent run returns the card to ``queued``."""
    from agents.base import AgentContext, DiveAgent
    from agents.runtime import claim_and_process_one
    from tests.test_api_flow import TestingSessionLocal

    class _ExplodingAgent(DiveAgent):
        name = "Exploder"
        version = "0.0.1"
        domain = "deloitte_client_research"

        def build_steps(self, ctx: AgentContext, inputs: dict):
            return []

        def decide(self, ctx: AgentContext, inputs: dict):
            raise RuntimeError("simulated agent crash")

    _queue(agent_id, case="RES-RETRY-1")
    db = TestingSessionLocal()
    try:
        case = claim_and_process_one(db, agent_lookup=lambda domain: _ExplodingAgent())
        assert case is None  # the run failed, nothing sealed
    finally:
        db.close()

    record = client.get("/api/v1/decisions", params={"case_id": "RES-RETRY-1"}).json()["decisions"][0]
    full = client.get(f"/api/v1/decisions/{record['task_id']}").json()
    assert full["task"]["status"] == "queued"  # back in the lane, not stuck running
    assert not any(e["event_type"] == "record_sealed" for e in full["events"])
    assert any(e["event_type"] == "processing_failed" for e in full["events"])


def test_concurrent_claimers_never_double_claim(tmp_path):
    """Issue #12 — two workers racing on the shared claim path claim each task once.

    Uses its own WAL-mode SQLite file so the two worker sessions genuinely
    contend at the database instead of sharing the test suite's pooled engine.
    """
    import threading

    from agents.runtime import claim_next_task
    from app.db import Base
    from app.models import Agent as AgentModel, DecisionEvent, Task as TaskModel
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    engine2 = create_engine(
        f"sqlite:///{tmp_path / 'claim.db'}",
        connect_args={"check_same_thread": False, "timeout": 15},
    )
    Base.metadata.create_all(bind=engine2)
    seed = sessionmaker(autocommit=False, autoflush=True, bind=engine2)()
    seed.execute(text("PRAGMA journal_mode=WAL"))
    agent = AgentModel(
        name="ResearchAgent", version="1.2.0", domain="deloitte_client_research", description="t"
    )
    seed.add(agent)
    seed.flush()
    for case in ("RES-RACE-1", "RES-RACE-2"):
        seed.add(
            TaskModel(
                agent_id=agent.agent_id, case_id=case, case_type="Market Entry — Race",
                inputs={}, status="queued",
            )
        )
    seed.commit()
    seed.close()

    barrier = threading.Barrier(2)
    claimed: list[str] = []

    def worker():
        db = sessionmaker(autocommit=False, autoflush=True, bind=engine2)()
        try:
            barrier.wait()
            for _ in range(2):  # loop until both tasks are gone
                won = claim_next_task(db)
                if won is None:
                    break
                claimed.append(won[0].case_id)
        finally:
            db.close()

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Each task claimed exactly once across both workers.
    assert sorted(claimed) == ["RES-RACE-1", "RES-RACE-2"]

    check = sessionmaker(autocommit=False, autoflush=True, bind=engine2)()
    try:
        for case in ("RES-RACE-1", "RES-RACE-2"):
            task = check.query(TaskModel).filter(TaskModel.case_id == case).first()
            assert task.status == "running"
            pickups = (
                check.query(DecisionEvent)
                .filter(DecisionEvent.task_id == task.task_id, DecisionEvent.event_type == "case_received")
                .count()
            )
            assert pickups == 1, f"{case} was claimed {pickups} times"
    finally:
        check.close()
        engine2.dispose()
