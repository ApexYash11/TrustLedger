"""Queue one live task + watch its status flip Queued -> Running -> Completed.

Usage (Terminal Oxromer / any terminal in D:\\TrustLedger):
    python demo_live_run.py
    python demo_live_run.py --escalate      # lands in Review Required (sealed)
    python demo_live_run.py --compliance    # runs ComplianceBot instead
    python demo_live_run.py --sse-seconds 12  # also prints live SSE frames
"""
import argparse
import json
import time
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1"


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode()
        return r.status, json.loads(body) if body else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--escalate", action="store_true", help="high-value task -> review_required")
    ap.add_argument("--compliance", action="store_true", help="use ComplianceBot domain")
    ap.add_argument("--sse-seconds", type=float, default=0, help="also stream SSE hub events")
    args = ap.parse_args()

    if args.compliance:
        name, domain, desc = "ComplianceBot", "regulatory_compliance", "Automated compliance scan bot."
        inputs = {"client_name": "Acme Corp", "research_question": "DPDP consent-flow scan?"}
    else:
        name, domain, desc = "ResearchAgent", "deloitte_client_research", "Deloitte client research agent."
        inputs = {"client_name": "Tata Power", "engagement_code": "ENG-2026-TP-018",
                  "research_question": "Enter the Rajasthan EV fast-charging market?"}
        if args.escalate:
            inputs["escalate"] = True
    agent = {"name": name, "version": "1.3.0" if not args.compliance else "1.0.1",
             "domain": domain, "description": desc}
    _, reg = call("POST", "/agents", agent)
    agent_id = reg["agent_id"]
    print(f"agent {name} id={agent_id}")

    _, queued = call("POST", "/decisions/queue", {
        "agent_id": agent_id, "case_id": f"LIVE-{int(time.time())}",
        "case_type": "Market Entry Assessment - EV Charging", "inputs": inputs})
    task_id = queued["task_id"]
    print(f"queued task_id={task_id} status={queued['status']}")
    print("Watch it move live at http://localhost:3000 (green Live dot = SSE connected)")

    if args.sse_seconds:
        import threading
        frames = []

        def watch():
            try:
                with urllib.request.urlopen(BASE + "/decisions/stream", timeout=args.sse_seconds + 5) as r:
                    end = time.time() + args.sse_seconds
                    while time.time() < end:
                        line = r.readline().decode(errors="ignore").strip()
                        if line.startswith("data:"):
                            frames.append(line[5:].strip())
            except Exception as e:  # timeout at end of window is fine
                frames.append(f"<stream ended: {e}>")

        t = threading.Thread(target=watch, daemon=True)
        t.start()

    # Dispatcher ticks every ~2s, so poll until terminal (max ~60s).
    last = None
    for _ in range(30):
        time.sleep(2)
        _, rec = call("GET", f"/decisions/{task_id}")
        status = rec["task"]["status"]
        if status != last:
            print(f"  -> {status}")
            last = status
        if status in ("completed", "review_required"):
            break

    _, verify = call("GET", f"/decisions/{task_id}/verify")
    print(f"sealed: verified={verify['verified']} chain={verify['chain_status']} hash={str(verify['record_hash'])[:12]}...")
    if args.sse_seconds:
        t.join(timeout=args.sse_seconds + 8)
        print(f"-- SSE frames mentioning this task ({len(frames)} total) --")
        hits = [f for f in frames if task_id in f] or frames[:5]
        for f in hits[:10]:
            print("  " + f[:220])


if __name__ == "__main__":
    main()
