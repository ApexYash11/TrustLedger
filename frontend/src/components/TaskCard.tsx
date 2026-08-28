"use client";

import { TaskSummary } from "@/lib/api";

const RISK_TAGS: Record<string, string> = {
  low: "bg-stone-100 text-stone-600 border-stone-200",
  medium: "bg-stone-800 text-white border-stone-800",
  high: "bg-stone-900 text-white border-stone-900",
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
  const tag = card.case_type || "Case";
  const riskKey = card.risk_level ?? "";
  const tagCls = RISK_TAGS[riskKey] ?? "bg-stone-100 text-stone-600 border-stone-200";

  return (
    <a
      href={`/decisions/${card.task_id}`}
      draggable
      className="card-hover block cursor-grab rounded-lg border border-stone-200 bg-white p-4 shadow-card active:cursor-grabbing"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${tagCls}`}>{tag}</span>
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
          {card.human_review_status && <span>In review</span>}
        </div>
        <span>{fmtDate(card.created_at)}</span>
      </div>
    </a>
  );
}
