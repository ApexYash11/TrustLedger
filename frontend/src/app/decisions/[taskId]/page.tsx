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

  if (error) return <main className="p-8 text-red-600">Failed to load decision: {error}</main>;
  if (!record) return <main className="p-8 text-slate-500">Loading…</main>;

  const task = record.task as { case_id?: string; case_type?: string; status?: string };
  const decision = record.decision as
    | { outcome?: string; outcome_summary?: string }
    | null;

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <a href="/" className="text-blue-600 text-sm hover:underline">
        ← Back to Command Center
      </a>
      <h1 className="text-xl font-bold mt-3 mb-1">{task.case_id}</h1>
      <p className="text-slate-500 mb-5">
        {task.case_type} · {task.status}
      </p>

      <section className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Decision Overview
        </h2>
        {decision ? (
          <>
            <p className="font-semibold">{decision.outcome?.replace(/_/g, " ")}</p>
            <p className="text-slate-600">{decision.outcome_summary}</p>
          </>
        ) : (
          <p className="text-slate-400">No decision recorded yet.</p>
        )}

        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-2">
          Decision Trail ({record.events.length} events)
        </h2>
        <ol>
          {record.events.map((e) => (
            <li key={e.event_id} className="py-1.5 border-b border-slate-100">
              <span className="text-slate-400 text-xs">{e.timestamp}</span>{" "}
              <span className="font-semibold text-sm">{e.summary}</span>
              <span className="text-slate-500 text-xs"> — {e.actor}</span>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-xs text-slate-400">
          Replay and Integrity tabs coming in Week 3.
        </p>
      </section>
    </main>
  );
}
