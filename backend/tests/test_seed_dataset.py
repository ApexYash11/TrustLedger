import json
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from seed.load_demo_data import (
    QUICK_TEMPLATES,
    QUEUED_CASES,
    RUNNING_PARTIALS,
    SEED_FILE,
    ensure_agent,
    _seed_scenario,
    _seed_quick_completed,
    _seed_running,
    _seed_queued,
    _tamper_case,
)

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(autocommit=False, autoflush=True, bind=test_engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_seed_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSession()
    try:
        agent = ensure_agent(db)
        data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        scenarios = data["scenarios"]
        now = datetime.now(timezone.utc)
        base = now - timedelta(days=3)

        for i, sc in enumerate(scenarios):
            _seed_scenario(db, agent, sc, base + timedelta(hours=i * 3))

        for j, tpl in enumerate(QUICK_TEMPLATES):
            _seed_quick_completed(db, agent, tpl, now - timedelta(days=1) + timedelta(minutes=j * 17))

        for j, spec in enumerate(RUNNING_PARTIALS):
            _seed_running(db, agent, spec, now - timedelta(minutes=40 - j * 10))

        for qc in QUEUED_CASES:
            _seed_queued(db, agent, qc["case_id"], qc["case_type"], qc["client"], qc["engagement_code"], now - timedelta(minutes=qc["offset_min"]))

        _tamper_case(db, "RES-2026-009999")
    finally:
        db.close()

    old_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if old_override is not None:
        app.dependency_overrides[get_db] = old_override
    else:
        app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=test_engine)


def test_seed_dataset_count_and_columns():
    resp = client.get("/api/v1/decisions")
    assert resp.status_code == 200
    body = resp.json()
    total = body["total"]
    decisions = body["decisions"]

    # Must have >= 25 records
    assert total >= 25, f"Expected at least 25 records, got {total}"
    assert len(decisions) >= 25

    statuses = {d["status"] for d in decisions}
    # All 4 Kanban columns must be represented
    for required_status in ["queued", "running", "review_required", "completed"]:
        assert required_status in statuses, f"Missing status '{required_status}' in seed dataset"


def test_hero_record_exists_in_review_required():
    resp = client.get("/api/v1/decisions", params={"case_id": "RES-2026-004821"})
    assert resp.status_code == 200
    results = resp.json()["decisions"]
    assert len(results) == 1
    hero = results[0]
    assert hero["status"] == "review_required"
    assert hero["risk_level"] == "high"


def test_tampered_record_integrity_failed():
    resp = client.get("/api/v1/decisions", params={"case_id": "RES-2026-009999"})
    assert resp.status_code == 200
    results = resp.json()["decisions"]
    assert len(results) == 1
    tampered_task_id = results[0]["task_id"]

    verify_resp = client.get(f"/api/v1/decisions/{tampered_task_id}/verify")
    assert verify_resp.status_code == 200
    verify = verify_resp.json()
    assert verify["verified"] is False
    assert verify["chain_status"] == "broken"
    assert "mismatch" in verify["message"].lower() or "broken" in verify["message"].lower()


def test_all_legitimate_sealed_records_pass_verification():
    resp = client.get("/api/v1/decisions")
    assert resp.status_code == 200
    decisions = resp.json()["decisions"]

    # Filter out unsealed tasks (queued/running) and the intentional tampered record
    verified_count = 0
    for d in decisions:
        if d["case_id"] == "RES-2026-009999":
            continue
        task_id = d["task_id"]
        v_resp = client.get(f"/api/v1/decisions/{task_id}/verify")
        assert v_resp.status_code == 200
        v = v_resp.json()
        if d["status"] in ("completed", "review_required"):
            assert v["verified"] is True, f"Legitimate record {d['case_id']} failed verify: {v}"
            assert v["chain_status"] == "intact"
            verified_count += 1
        elif d["status"] in ("queued", "running"):
            assert v["chain_status"] == "unsealed"

    # We expect 17 legitimate sealed records
    assert verified_count >= 15, f"Expected at least 15 verified records, got {verified_count}"
