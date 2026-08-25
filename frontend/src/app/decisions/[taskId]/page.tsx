"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, FullDecisionRecord } from "@/lib/api";

export default function DecisionDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params?.taskId;
  const [record, setRecord] = useState<FullDecisionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    api
      .getDecision(taskId)
      .then(setRecord)
      .catch((e) => setError(e.message));
  }, [taskId]);

  if (error) return <main style={{ padding: 32 }}>Failed to load decision: {error}</main>;
  if (!record) return <main style={{ padding: 32 }}>Loading…</main>;

  const task = record.task as { case_id?: string; case_type?: string; status?: string };
  const decision = record.decision as
    | { outcome?: string; outcome_summary?: string }
    | null;

  return (
    <main style={{ padding: 24 }}>
      <a href="/" style={{ color: "#2563eb", fontSize: 14 }}>
        ← Back to Command Center
      </a>
      <h1 style={{ fontSize: 20, margin: "12px 0 4px" }}>{task.case_id}</h1>
      <p style={{ color: "#64748b", marginBottom: 20 }}>
        {task.case_type} · {task.status}
      </p>

      <section
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,.08)",
          maxWidth: 720,
        }}
      >
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Decision Overview
        </h2>
        {decision ? (
          <>
            <p style={{ fontWeight: 600 }}>{decision.outcome?.replace(/_/g, " ")}</p>
            <p style={{ color: "#475569" }}>{decision.outcome_summary}</p>
          </>
        ) : (
          <p style={{ color: "#94a3b8" }}>No decision recorded yet.</p>
        )}

        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, margin: "20px 0 8px" }}>
          Decision Trail ({record.events.length} events)
        </h2>
        <ol style={{ listStyle: "none" }}>
          {record.events.map((e) => (
            <li key={e.event_id} style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>{e.timestamp}</span>{" "}
              <span style={{ fontWeight: 600, fontSize: 14 }}>{e.summary}</span>
              <span style={{ color: "#64748b", fontSize: 12 }}> — {e.actor}</span>
            </li>
          ))}
        </ol>

        <p style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
          Replay and Integrity tabs coming in Week 3.
        </p>
      </section>
    </main>
  );
}
