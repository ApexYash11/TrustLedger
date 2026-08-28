"""Simulated Deloitte client research agent - drives the TrustLedger logging API.

Reads scenarios from seed/demo_data.json and executes them against a running
TrustLedger API with realistic delays, producing varied outcomes.

Usage:
    python -m agents.research_agent                # run all non-queued scenarios
    python -m agents.research_agent --case RES-2026-004821
    AGENT_DELAY=0.2 python -m agents.research_agent

Environment:
    TRUSTLEDGER_API   base URL (default http://localhost:8000/api/v1)
    AGENT_DELAY       seconds between steps (default 0.4)
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx

API = os.environ.get("TRUSTLEDGER_API", "http://localhost:8000/api/v1")
DELAY = float(os.environ.get("AGENT_DELAY", "0.4"))
SEED_FILE = Path(__file__).parent.parent / "seed" / "demo_data.json"


def ensure_agent(client: httpx.Client) -> str:
    existing = client.get("/agents")
    # No list endpoint for agents; register is idempotent-enough for the demo
    # because each registration creates a new agent row - reuse by name lookup via DB
    # is unnecessary here since the dashboard groups by agent name.
    resp = client.post(
        "/agents",
        json={
            "name": "ResearchAgent",
            "version": "1.2.0",
            "domain": "deloitte_client_research",
            "description": "Simulated Deloitte client research agent",
        },
    )
    resp.raise_for_status()
    return resp.json()["agent_id"]


def log_step(case_id: str, icon: str, text: str):
    print(f"  {icon} [{case_id}] {text}")


def run_scenario(client: httpx.Client, agent_id: str, sc: dict) -> dict:
    case_id = sc["case_id"]
    target = sc.get("status_target", "completed")

    resp = client.post(
        "/decisions/start",
        json={
            "agent_id": agent_id,
            "case_id": case_id,
            "case_type": sc["case_type"],
            "inputs": sc["inputs"],
        },
    )
    resp.raise_for_status()
    task_id = resp.json()["task_id"]
    log_step(case_id, ">", "started")

    time.sleep(DELAY)

    for ev in sc["events"]:
        details = dict(ev.get("details") or {})
        if "evidence" in ev:
            details["evidence"] = ev["evidence"]
        if "policy_reference" in ev:
            details["policy_reference"] = ev["policy_reference"]
        payload = {
            "event_type": ev["event_type"],
            "summary": ev["summary"],
            "actor": ev.get("actor", "agent"),
        }
        if details:
            payload["details"] = details
        r = client.post(f"/decisions/{task_id}/events", json=payload)
        r.raise_for_status()
        log_step(case_id, "-", f"{ev['event_type']}: {ev['summary']}")
        time.sleep(DELAY)

    if target == "running":
        log_step(case_id, "||", "left running (no completion)")
        return {"case_id": case_id, "task_id": task_id, "status": "running"}

    d = sc["decision"]
    resp = client.post(
        f"/decisions/{task_id}/complete",
        json={
            "outcome": d["outcome"],
            "outcome_summary": d["outcome_summary"],
            "structured_rationale": d["structured_rationale"],
            "alternatives_considered": d.get("alternatives_considered"),
            "confidence_score": d.get("confidence_score"),
            "requires_human_review": sc.get("requires_human_review", False),
            "risk_level": sc.get("risk_level"),
        },
    )
    resp.raise_for_status()
    body = resp.json()
    log_step(case_id, "[done]", f"{body['status']} - sealed at chain #{body['audit_record']['chain_sequence']}")
    return {"case_id": case_id, "task_id": task_id, "status": body["status"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", help="run only the scenario with this case_id")
    args = parser.parse_args()

    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    scenarios = data["scenarios"]
    if args.case:
        scenarios = [s for s in scenarios if s["case_id"] == args.case]
        if not scenarios:
            print(f"No scenario found for {args.case}")
            sys.exit(1)
    # queued scenarios are not executed by the agent; running ones stop mid-flight
    scenarios = [s for s in scenarios if s.get("status_target") != "queued"]

    print(f"TrustLedger simulated research agent -> {API}")
    print(f"Running {len(scenarios)} scenario(s) with {DELAY}s step delay\n")

    with httpx.Client(base_url=API, timeout=30) as client:
        agent_id = ensure_agent(client)
        results = [run_scenario(client, agent_id, sc) for sc in scenarios]

    print("\n=== Agent Run Summary ===")
    for r in results:
        print(f"  {r['case_id']}: {r['status']}")


if __name__ == "__main__":
    main()
