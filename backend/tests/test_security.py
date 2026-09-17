"""Authentication, principal identity and PII redaction (EOI Security scope).

The app only enforces auth when TRUSTLEDGER_API_KEYS / TRUSTLEDGER_API_KEY is
configured (see app/security.py), so these tests set and clear the environment
around the shared TestClient instead of interfering with the other suites,
which run in open dev mode.
"""

import os

import pytest

import app.security as security
from app.services.redaction import redact_inputs, redact_pii
from tests.test_api_flow import client, setup_db, agent_id  # reuse fixtures/app


@pytest.fixture()
def auth_agent_id(enforced):
    """A registered agent, created BY the enforced principal."""
    resp = client.post(
        "/api/v1/agents",
        headers=AUTH,
        json={"name": "ResearchAgent", "version": "1.2.0", "domain": "deloitte_client_research"},
    )
    return resp.json()["agent_id"]


@pytest.fixture()
def enforced():
    """Turn auth on for one test, then restore the previous state."""
    previous = os.environ.get("TRUSTLEDGER_API_KEYS")
    os.environ["TRUSTLEDGER_API_KEYS"] = "compliance-analyst:test-key-1,claims-auditor:test-key-2"
    security._keys_cache = None  # force the module's cache to reload
    yield {"compliance-analyst": "test-key-1", "claims-auditor": "test-key-2"}
    if previous is None:
        os.environ.pop("TRUSTLEDGER_API_KEYS", None)
    else:
        os.environ["TRUSTLEDGER_API_KEYS"] = previous
    security._keys_cache = None


@pytest.fixture()
def open_mode():
    os.environ.pop("TRUSTLEDGER_API_KEYS", None)
    security._keys_cache = None
    yield
    security._keys_cache = None


AUTH = {"Authorization": "Bearer test-key-1"}


def test_missing_key_401(enforced):
    assert client.get("/api/v1/decisions").status_code == 401
    assert client.get("/api/v1/agents").status_code == 401


def test_invalid_key_403(enforced):
    bad = {"Authorization": "Bearer wrong-key"}
    assert client.get("/api/v1/decisions", headers=bad).status_code == 403


def test_valid_key_passes(enforced):
    assert client.get("/api/v1/decisions", headers=AUTH).status_code == 200


def test_health_stays_public(enforced):
    assert client.get("/health").status_code == 200


def test_sse_accepts_key_query_param(enforced):
    """EventSource cannot set headers, so the SSE route takes ?key= instead.

    Verified at the middleware level: the full request cannot go through
    TestClient because a never-ending streaming body blocks the test client
    (not the app). The real browser path is exercised by the board's
    EventSource connection in the running demo.
    """
    from starlette.requests import Request

    req = Request({
        "type": "http", "method": "GET",
        "path": "/api/v1/decisions/stream",
        "query_string": b"key=test-key-2",
        "headers": [],
    })
    assert security.principal_of(req) == "claims-auditor"


def test_actor_is_authenticated_principal_not_caller_text(enforced, auth_agent_id):
    """The caller cannot claim an identity: actor comes from the key itself."""
    task_id = client.post(
        "/api/v1/decisions/start",
        headers=AUTH,
        json={"agent_id": auth_agent_id, "case_id": "SEC-001", "case_type": "Test", "inputs": {}},
    ).json()["task_id"]
    # The schema has no `actor` field; Pydantic drops it. The request succeeds
    # but the event is stamped with the principal behind the key, not the text
    # the caller tried to claim.
    spoofed = client.post(
        f"/api/v1/decisions/{task_id}/events",
        headers=AUTH,
        json={"event_type": "evidence_evaluated", "summary": "Spoofed identity attempt", "actor": "pretend-i-am-someone-else"},
    ).json()
    record = client.get(f"/api/v1/decisions/{task_id}", headers=AUTH).json()
    spoofed_event = [e for e in record["events"] if e["event_id"] == spoofed["event_id"]][0]
    assert spoofed_event["actor"] == "compliance-analyst"
    assert spoofed_event["actor"] != "pretend-i-am-someone-else"
    # A well-formed append is stamped with the real principal.
    ok = client.post(
        f"/api/v1/decisions/{task_id}/events",
        headers=AUTH,
        json={"event_type": "evidence_evaluated", "summary": "Genuine append"},
    ).json()
    record = client.get(f"/api/v1/decisions/{task_id}", headers=AUTH).json()
    stamped = [e for e in record["events"] if e["event_id"] == ok["event_id"]][0]
    assert stamped["actor"] == "compliance-analyst"


def test_status_patch_recorded_under_principal(enforced, auth_agent_id):
    task_id = client.post(
        "/api/v1/decisions/start",
        headers=AUTH,
        json={"agent_id": auth_agent_id, "case_id": "SEC-002", "case_type": "Test", "inputs": {}},
    ).json()["task_id"]
    client.patch(f"/api/v1/decisions/{task_id}/status", headers=AUTH, json={"status": "disputed"})
    record = client.get(f"/api/v1/decisions/{task_id}", headers=AUTH).json()
    moves = [e for e in record["events"] if e["event_type"] == "status_changed"]
    assert moves and all(m["actor"] == "compliance-analyst" for m in moves)


def test_malformed_config_fails_closed():
    """Review P1: a non-empty but malformed key list must raise, never fall
    back to silently-disabled auth."""
    os.environ["TRUSTLEDGER_API_KEYS"] = "garbage-without-colon, another"
    security._keys_cache = None
    try:
        with pytest.raises(RuntimeError):
            security.load_keys()
        with pytest.raises(RuntimeError):
            security.validate_auth_config()
    finally:
        os.environ.pop("TRUSTLEDGER_API_KEYS", None)
        security._keys_cache = None


def test_blank_config_is_explicit_open_mode():
    """Review P1: open dev mode is reserved for ABSENT configuration."""
    os.environ["TRUSTLEDGER_API_KEYS"] = ""
    security._keys_cache = None
    try:
        assert security.load_keys() == {}
        assert security.auth_enabled() is False
    finally:
        os.environ.pop("TRUSTLEDGER_API_KEYS", None)
        security._keys_cache = None


def test_auth_failures_carry_cors_headers(enforced):
    """Review P2: 401/403 from auth must include Access-Control-Allow-Origin
    so the browser surfaces the real error, not a generic network failure."""
    origin = {"Origin": "http://localhost:3000"}
    no_key = client.get("/api/v1/decisions", headers=origin)
    assert no_key.status_code == 401
    assert no_key.headers.get("access-control-allow-origin") == "http://localhost:3000"

    bad = client.get("/api/v1/decisions", headers={**origin, "Authorization": "Bearer wrong"})
    assert bad.status_code == 403
    assert bad.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_preflight_still_passes(enforced):
    """The CORS-outermost reorder must not regress the browser preflight path."""
    resp = client.options(
        "/api/v1/decisions",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


# --- redaction -------------------------------------------------------------


def test_redact_email_phone_card():
    text = "Contact priya.sharma@example.com or +91-98765 43210. Card 4111 1111 1111 1111."
    out = redact_pii(text)
    assert "priya.sharma" not in out
    assert "98765" not in out
    assert "4111" not in out
    assert out.count("[REDACTED]") == 3


def test_redact_inputs_copies_and_preserves_structure():
    inputs = {"research_question": "email dev@corp.com", "nested": ["keep", 42], "client_name": "Acme"}
    out = redact_inputs(inputs)
    assert out["research_question"] == "email [REDACTED]"
    assert out["nested"] == ["keep", 42]  # non-strings untouched
    assert inputs["research_question"] == "email dev@corp.com"  # no mutation


def test_redact_nested_containers():
    """Review P2: strings inside nested dicts and lists must be redacted too."""
    inputs = {
        "research_question": "plain question",
        "context": {
            "contact": "nested@example.com",
            "history": ["spoke to +91-90000 00000", {"email": "deep@example.com"}],
            "count": 7,
        },
    }
    out = redact_inputs(inputs)
    assert out["context"]["contact"] == "[REDACTED]"
    assert out["context"]["history"][0] == "spoke to [REDACTED]"
    assert out["context"]["history"][1]["email"] == "[REDACTED]"
    assert out["context"]["count"] == 7  # non-strings preserved
    # Original input untouched (no mutation).
    assert inputs["context"]["contact"] == "nested@example.com"
    assert inputs["context"]["history"][0] == "spoke to +91-90000 00000"


def test_auth_off_when_unset(open_mode, agent_id):
    """Dev mode: no keys configured means the API stays open (23 base tests
    depend on this)."""
    assert security.load_keys() == {}
    assert client.get("/api/v1/decisions").status_code == 200
