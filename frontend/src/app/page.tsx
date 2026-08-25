"use client";

import { useCallback, useEffect, useState } from "react";
import { api, DecisionListResponse } from "@/lib/api";

const COLUMNS = ["queued", "running", "review_required", "completed"] as const;
const COLUMN_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  review_required: "Review Required",
  completed: "Completed",
};

const RISK_COLORS: Record<string, string> = {
  low: "#16a34a",
  medium: "#d97706",
  high: "#dc2626",
};

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
    return <main style={{ padding: 32 }}>Backend unreachable: {error}</main>;
  }
  if (!data) return <main style={{ padding: 32 }}>Loading…</main>;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>TrustLedger</h1>
      <p style={{ color: "#64748b", marginBottom: 20 }}>
        Agent Command Center · {data.total} tasks
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {COLUMNS.map((col) => {
          const cards = data.decisions.filter(
            (d) => d.status === col || (col === "review_required" && d.status === "disputed")
          );
          return (
            <section key={col}>
              <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, color: "#475569" }}>
                {COLUMN_LABELS[col]} ({cards.length})
              </h2>
              {cards.map((card) => (
                <a
                  key={card.task_id}
                  href={`/decisions/${card.task_id}`}
                  style={{
                    display: "block",
                    background: "#fff",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    textDecoration: "none",
                    color: "inherit",
                    boxShadow: "0 1px 2px rgba(0,0,0,.08)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{card.case_id}</div>
                  <div style={{ fontSize: 12, color: "#64748b", margin: "4px 0" }}>{card.case_type}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    {card.risk_level && (
                      <span style={{ color: RISK_COLORS[card.risk_level] }}>● {card.risk_level}</span>
                    )}
                    {card.outcome && <span>{card.outcome.replace(/_/g, " ")}</span>}
                    {card.duration_seconds != null && (
                      <span style={{ color: "#94a3b8" }}>{Math.round(card.duration_seconds)}s</span>
                    )}
                  </div>
                </a>
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
