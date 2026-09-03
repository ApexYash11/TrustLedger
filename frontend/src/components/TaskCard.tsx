"use client";

import { useState, useRef, useEffect } from "react";
import { TaskSummary } from "@/lib/api";

const RISK_TAGS: Record<string, string> = {
  low: "bg-stone-100 text-stone-600 border-stone-200",
  medium: "bg-stone-800 text-white border-stone-800",
  high: "bg-stone-900 text-white border-stone-900",
};

/** Status actions available from the kebab menu, keyed by target status. */
const STATUS_ACTIONS: { label: string; status: string; icon: string }[] = [
  { label: "Mark Disputed", status: "disputed", icon: "⚠" },
  { label: "Send to Review", status: "review_required", icon: "↩" },
  { label: "Mark Completed", status: "completed", icon: "✓" },
  { label: "Re-queue", status: "queued", icon: "↻" },
];

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

interface TaskCardProps {
  card: TaskSummary;
  /** Called when the user picks a new status from the kebab menu. */
  onStatusChange?: (taskId: string, newStatus: string) => void;
}

export default function TaskCard({ card, onStatusChange }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const tag = card.case_type || "Case";
  const riskKey = card.risk_level ?? "";
  const tagCls = RISK_TAGS[riskKey];
  const isDisputed = card.status === "disputed";
  const reviewLabel =
    card.human_review_status === "pending"
      ? "In review"
      : card.human_review_status
        ? card.human_review_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : null;

  // Filter out the card's current status so users only see transitions they can make
  const availableActions = STATUS_ACTIONS.filter((a) => a.status !== card.status);

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

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
          {isDisputed && (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              Disputed
            </span>
          )}
        </div>

        {/* Kebab menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            className="rounded px-1 py-0.5 text-stone-300 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            ···
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
              {availableActions.map((action) => (
                <button
                  key={action.status}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(false);
                    onStatusChange?.(card.task_id, action.status);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-stone-50 ${
                    action.status === "disputed"
                      ? "font-medium text-amber-700 hover:bg-amber-50"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <span className="w-4 text-center text-sm">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
