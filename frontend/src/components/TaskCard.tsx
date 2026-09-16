"use client";

import { useState } from "react";
import { TaskSummary } from "@/lib/api";

// Plain dash instead of em-dash (flagged by writing-quality checkers).
const clean = (s: string) => s.replace(/—/g, "-").replace(/–/g, "-");

function fmtDuration(seconds: number | null) {
  if (seconds == null) return null;
  const total = Math.round(seconds);
  if (total >= 60) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${total}s`;
}

/** Lane accent colors (same palette as the reference stage dots/chips). */
const LANE_ACCENT: Record<string, string> = {
  queued: "#8b96a4",
  running: "#b06f14",
  review_required: "#2c6bd1",
  completed: "#2f8f4e",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Status actions available from the kebab menu (issue #9), keyed by target status. */
const STATUS_ACTIONS: { label: string; status: string; icon: string }[] = [
  { label: "Mark Disputed", status: "disputed", icon: "!" },
  { label: "Send to Review", status: "review_required", icon: "<" },
  { label: "Mark Completed", status: "completed", icon: "v" },
  { label: "Re-queue", status: "queued", icon: "o" },
  { label: "Set Running", status: "running", icon: ">" },
];

export default function TaskCard({
  card,
  onStatusChange,
  onDelete,
}: {
  card: TaskSummary;
  /** Called when the user picks a new status from the kebab menu. */
  onStatusChange?: (taskId: string, newStatus: string) => void;
  /** Called when the user picks Delete - parent owns the confirm modal (issue #6). */
  onDelete?: (card: TaskSummary) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tag = clean(card.case_type || "Case");
  const accent = LANE_ACCENT[card.status] ?? LANE_ACCENT.review_required;
  const summary = card.outcome_summary ?? card.outcome?.replace(/_/g, " ") ?? card.agent_name ?? null;
  const isDisputed = card.status === "disputed";
  // Filter out the card's current status so users only see transitions they can make.
  const availableActions = STATUS_ACTIONS.filter((a) => a.status !== card.status);
  const reviewLabel =
    card.human_review_status === "pending"
      ? "In review"
      : card.human_review_status
        ? card.human_review_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : null;

  return (
    <div
      draggable
      className="relative flex w-full min-h-[186px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-[14px] px-4 py-[15px] shadow-card transition-[box-shadow] duration-[120ms] hover:shadow-card-hover"
      style={{ background: `linear-gradient(to top left, ${accent}14 0%, var(--surface) 52%)` }}
    >
      {/* Link layer covers the whole card except the options button */}
      <a
        href={`/decisions/${card.task_id}`}
        className="absolute inset-0 z-0 rounded-[14px]"
        aria-label={`Open ${card.case_id}`}
      />

      {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />}

      <div className="relative z-0 flex items-center gap-2">
        <span
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
          style={{ background: "transparent", border: `1px solid ${accent}55`, color: accent }}
        >
          <span className="truncate">{tag}</span>
        </span>
        {card.risk_level === "high" && (
          <span className="shrink-0 rounded-full bg-[#fbe9e7] px-2 py-0.5 text-[10.5px] font-semibold text-[#cf3d2e]">⚠ High</span>
        )}
        {isDisputed && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}
          >
            Disputed
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Card options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="z-20 shrink-0 cursor-pointer border-none bg-transparent text-[15px] leading-none text-faint hover:text-muted"
        >
          ⋯
        </button>
      </div>

      <div className="pointer-events-none relative z-0">
        <h3 className="mt-[5px] line-clamp-2 text-[14.5px] font-semibold text-text break-words">{card.case_id}</h3>
        {summary && <p className="font-mono text-[11px] text-muted line-clamp-1">{summary}</p>}
      </div>

      <div className="min-h-1 flex-1" />

      <div className="pointer-events-none relative z-0 flex items-center gap-2 border-t border-[var(--card-line)] pt-[9px]">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10.5px] font-medium"
          style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          {fmtDuration(card.duration_seconds) ?? card.status.replace(/_/g, " ")}
        </span>
        {reviewLabel && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10.5px] font-medium"
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            {reviewLabel}
          </span>
        )}
        <div className="flex-1" />
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-hover text-[8.5px] font-semibold text-ink">
          {initials(card.agent_name || "AI")}
        </span>
      </div>

      <a
        href={`/decisions/${card.task_id}`}
        className="relative z-0 mt-0.5 w-full cursor-pointer rounded-full p-2 text-center text-[12.5px] font-semibold no-underline hover:brightness-96"
        style={{ background: "transparent", color: accent, border: `1px solid ${accent}66` }}
      >
        Open record
      </a>

      {menuOpen && (
        <div className="absolute right-3 top-10 z-20 w-44 overflow-hidden rounded-[12px] border border-border bg-surface py-1 shadow-pop">
          <a
            href={`/decisions/${card.task_id}`}
            className="block px-3 py-1.5 text-[13px] text-text-2 no-underline hover:bg-hover"
          >
            Open decision
          </a>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[13px] text-text-2 hover:bg-hover"
            onClick={() => {
              navigator.clipboard
                ?.writeText(`${window.location.origin}/decisions/${card.task_id}`)
                .catch(() => {});
              setMenuOpen(false);
            }}
          >
            Copy link
          </button>
          <div className="my-1 border-t border-border" />
          {availableActions.map((action) => (
            <button
              key={action.status}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[13px] text-text-2 hover:bg-hover"
              onClick={() => {
                onStatusChange?.(card.task_id, action.status);
                setMenuOpen(false);
              }}
            >
              {action.label}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDelete?.(card);
            }}
            className="block w-full px-3 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-hover"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
