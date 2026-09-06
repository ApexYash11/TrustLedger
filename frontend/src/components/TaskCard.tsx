"use client";

import { TaskSummary } from "@/lib/api";

// Plain dash instead of em-dash (flagged by writing-quality checkers).
const clean = (s: string) => s.replace(/—/g, "-").replace(/–/g, "-");

const RISK_TAGS: Record<string, string> = {
  low: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-red-100 text-red-700 border-red-200",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TaskCard({ card }: { card: TaskSummary }) {
  const tag = clean(card.case_type || "Case");
  const riskKey = card.risk_level ?? "";
  const tagCls = RISK_TAGS[riskKey];
  const reviewLabel =
    card.human_review_status === "pending"
      ? "In review"
      : card.human_review_status
        ? card.human_review_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : null;

  return (
    <a
      href={`/decisions/${card.task_id}`}
      draggable
      className="card-hover block cursor-grab rounded-lg border border-stone-200 bg-white p-4 shadow-card active:cursor-grabbing"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
            {tag}
          </span>
          {tagCls && (
            <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${tagCls}`}>
              {riskKey}
            </span>
          )}
        </div>
        <span className="text-stone-300 hover:text-stone-500">...</span>
      </div>

      <h3 className="mb-1.5 text-sm font-semibold leading-snug text-stone-900">{card.case_id}</h3>
      <p className="mb-4 line-clamp-2 text-[13px] leading-relaxed text-stone-500">
        {card.outcome_summary ?? card.outcome?.replace(/_/g, " ") ?? "No summary recorded yet."}
      </p>

      <div className="flex items-center justify-between text-xs text-stone-400">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-[9px] font-bold text-stone-600">
            {initials(card.agent_name || "AI")}
          </span>
          {card.duration_seconds != null && <span>{Math.round(card.duration_seconds)}s</span>}
          {reviewLabel && <span>{reviewLabel}</span>}
        </div>
        <span>{fmtDate(card.created_at)}</span>
      </div>
    </a>
  );
}
