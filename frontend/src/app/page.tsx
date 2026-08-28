"use client";

import { useCallback, useEffect, useState } from "react";
import { api, DecisionListResponse, TaskSummary } from "@/lib/api";

const COLUMNS = ["queued", "running", "review_required", "completed"] as const;
const COLUMN_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  review_required: "Review Required",
  completed: "Completed",
};

const RISK_STYLES: Record<string, string> = {
  low: "text-green-600",
  medium: "text-amber-600",
  high: "text-red-600",
};

function TaskCard({ card }: { card: TaskSummary }) {
  return (
    <a
      href={`/decisions/${card.task_id}`}
      className="block rounded-lg bg-white p-3 mb-2 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="font-semibold text-sm">{card.case_id}</div>
      <div className="text-xs text-slate-500 my-1">{card.case_type}</div>
      <div className="flex gap-2 items-center text-xs">
        {card.risk_level && (
          <span className={RISK_STYLES[card.risk_level] ?? ""}>● {card.risk_level}</span>
        )}
        {card.outcome && <span>{card.outcome.replace(/_/g, " ")}</span>}
        {card.duration_seconds != null && (
          <span className="text-slate-400">{Math.round(card.duration_seconds)}s</span>
        )}
      </div>
    </a>
  );
}

export default function KanbanPage() {
  const [data, setData] = useState<DecisionListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .listDecisions()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (error && !data) {
    return <main className="p-8 text-red-600">Backend unreachable: {error}</main>;
  }
  if (!data) return <main className="p-8 text-slate-500">Loading…</main>;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-1">TrustLedger</h1>
      <p className="text-slate-500 mb-5">Research Command Center · {data.total} engagements</p>
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const cards = data.decisions.filter(
            (d) => d.status === col || (col === "review_required" && d.status === "disputed")
          );
          return (
            <section key={col}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {COLUMN_LABELS[col]} ({cards.length})
              </h2>
              {cards.map((card) => (
                <TaskCard key={card.task_id} card={card} />
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
