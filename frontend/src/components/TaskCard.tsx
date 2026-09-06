"use client";

import { useState } from "react";
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

export default function TaskCard({ card, onDelete }: { card: TaskSummary; onDelete: (card: TaskSummary) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tag = card.case_type || "Case";
  const riskKey = card.risk_level ?? "";
  const tagCls = RISK_TAGS[riskKey];
  const reviewLabel =
    card.human_review_status === "pending"
      ? "In review"
      : card.human_review_status
        ? card.human_review_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : null;

  return (
    <article className="card-hover relative rounded-lg border border-stone-200 bg-white p-4 shadow-card">
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
        <div className="relative">
          <button
            type="button"
            aria-label={`Actions for ${card.case_id}`}
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            className="rounded px-1.5 text-stone-300 hover:bg-stone-100 hover:text-stone-600"
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-28 rounded-md border border-stone-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuOpen(false);
                  onDelete(card);
                }}
                className="w-full px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <a href={`/decisions/${card.task_id}`} className="block">
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
    </article>
  );
}
