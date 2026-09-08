"""End-to-end smoke test for the issue #12 fixes (1-9) against a live server.

Run with the dispatcher ENABLED and an isolated database:

    cd backend
    $env:DATABASE_URL='sqlite:///./smoke_test.db'; $env:TRUSTLEDGER_POLL='0.3'
    python -m uvicorn app.main:app --port 8765
    python smoke_e2e.py

Covers: idempotent agent registration (no duplicate agent_id, stale-version
reconciliation), domain-gated queueing (422 NO_AGENT_IMPLEMENTATION), the atomic
shared claim path, the dispatcher sealing a decision under the queued agent
identity, and SSE frames for live Kanban card movement.
"""
import json
import time

import requests

BASE = "http://127.0.0.1:8765/api/v1"


def wait_for(predicate, timeout=20.0, interval=0.2, what="condition"):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError(f"timed out waiting for {what}")


def main() -> None:
    # Fix 6: simulate a pre-existing row from a previous run (different version);
    # registering again must reuse it, never mint a second agent_id.
    agent_id = requests.post(
        f"{BASE}/agents",
        json={"name": "ResearchAgent", "version": "9.9.9-legacy", "domain": "deloitte_client_research"},
    ).json()["agent_id"]

    dup = requests.post(
        f"{BASE}/agents",
        json={"name": "ResearchAgent", "version": "1.2.0", "domain": "deloitte_client_research"},
    ).json()
    assert dup["agent_id"] == agent_id, (agent_id, dup)

    # Fix 6: duplicate POST reconciles stale metadata instead of reporting it.
    row = next(
        a for a in requests.get(f"{BASE}/agents").json()["agents"] if a["agent_id"] == agent_id
    )
    assert row["version"] == "1.2.0", row
    count_before = len(requests.get(f"{BASE}/agents").json()["agents"])

    # Fix 2/7: supported domain queues fine; unsupported domain is rejected.
    task_id = requests.post(
        f"{BASE}/decisions/queue",
        json={
            "agent_id": agent_id,
            "case_id": "RES-SMOKE-001",
            "case_type": "Market Entry — Smoke",
            "inputs": {"client_name": "ACME"},
        },
    )
    assert task_id.status_code == 200, task_id.text
    task_id = task_id.json()["task_id"]

    other = requests.post(
        f"{BASE}/agents",
        json={"name": "OrphanBot", "version": "0.1.0", "domain": "no_such_domain"},
    ).json()
    bad = requests.post(
        f"{BASE}/decisions/queue",
        json={
            "agent_id": other["agent_id"],
            "case_id": "REG-SMOKE-002",
            "case_type": "Regulatory Scan — Smoke",
            "inputs": {"client_name": "ACME"},
        },
    )
    assert bad.status_code == 422, bad.status_code
    assert bad.json()["detail"]["code"] == "NO_AGENT_IMPLEMENTATION", bad.text
    assert len(requests.get(f"{BASE}/agents").json()["agents"]) == count_before + 1

    # Fix 8: the explicit claim endpoint shares the atomic claim implementation.
    claim = requests.post(f"{BASE}/decisions/claim")
    assert claim.status_code == 200, claim.text
    assert claim.json()["task_id"] == task_id and claim.json()["status"] == "running"
    empty = requests.post(f"{BASE}/decisions/claim")
    assert empty.status_code == 404 and empty.json()["detail"]["code"] == "NO_QUEUED_TASKS"

    # Fix 5 + 1 + 3: dispatcher claims a fresh task, streams events, seals it
    # under the agent identity the task was queued with.
    task2 = requests.post(
        f"{BASE}/decisions/queue",
        json={
            "agent_id": agent_id,
            "case_id": "RES-SMOKE-003",
            "case_type": "Market Entry — Smoke 2",
            "inputs": {"client_name": "Globex"},
        },
    ).json()["task_id"]

    def decision_ready():
        record = requests.get(f"{BASE}/decisions/{task2}").json()
        if record["task"]["status"] in ("completed", "review_required"):
            return record
        return None

    record = wait_for(decision_ready, what="dispatcher to seal the decision")
    assert record["decision"]["outcome"], record
    # Sealed under the agent identity the task was queued with (Fix 1).
    assert record["task"]["agent_id"] == agent_id

    # Fix 9 + 4: SSE clients receive live claim/processed frames (cross-thread).
    with requests.get(f"{BASE}/decisions/stream", stream=True, timeout=25) as stream:
        assert stream.headers["content-type"].startswith("text/event-stream")
        task3 = requests.post(
            f"{BASE}/decisions/queue",
            json={
                "agent_id": agent_id,
                "case_id": "RES-SMOKE-004",
                "case_type": "Market Entry — Smoke 3",
                "inputs": {"client_name": "Initech"},
            },
        ).json()["task_id"]

        got_running = got_processed = False
        start = time.time()
        for line in stream.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            payload = json.loads(line[6:])
            if payload.get("task_id") == task3 and payload.get("status") == "running":
                got_running = True  # Fix 4: claim emits task_status_update
            if payload.get("event") == "task_processed" and payload.get("task_id") == task3:
                got_processed = True
            if got_running and got_processed:
                break
            assert time.time() - start < 25, (
                f"SSE frames incomplete: running={got_running} processed={got_processed}"
            )

    print("E2E SMOKE PASSED: idempotent registration, metadata reconciliation,")
    print("domain-gated queueing, atomic claim, dispatcher seal, SSE live updates.")


if __name__ == "__main__":
    main()
