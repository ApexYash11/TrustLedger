"use client";

import { useState } from "react";
import { TaskSummary } from "@/lib/api";
import { OUTCOME, RISK, STATUS, lookup, toneColor } from "@/lib/vocab";
import Chip, { RiskIcon } from "@/components/Chip";

// Plain dash instead of em-dash (flagged by writing-quality checkers).
const clean = (s: string) => s.replace(/—/g, "-").replace(/–/g, "-");

function fmtDuration(seconds: number | null) {
  if (seconds == null) return null;
  const total = Math.round(seconds);
  if (total >= 60) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${total}s`;
}


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

/**
 * Terminal states are reachable only through a sealed decision record, never a
 * status PATCH — the API answers 409 TASK_NOT_SEALED. Offering them produced a
 * move that always failed and bounced back, so they are never shown.
 */
const TERMINAL_STATUSES = new Set(["completed", "review_required"]);

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
  const statusEntry = lookup(STATUS, card.status);
  const outcomeEntry = lookup(OUTCOME, card.outcome);
  const riskEntry = lookup(RISK, card.risk_level);
  // The card is tinted by its outcome once decided, by its lane before that:
  // colour should track the thing the reader cares about most at that moment.
  const accent = toneColor((outcomeEntry ?? statusEntry)?.tone ?? "neutral");
  const question = card.research_question?.trim() || "";
  // Older records were created when case_id WAS the question text, so showing
  // both printed the same sentence twice. Only surface the id when it is a real
  // identifier rather than a copy of the headline.
  const showCaseId = Boolean(card.case_id) && card.case_id !== question && !question.startsWith(card.case_id);
  const summary = card.outcome_summary ?? card.outcome?.replace(/_/g, " ") ?? card.agent_name ?? null;
  const isDisputed = card.status === "disputed";
  // Only offer transitions the API will actually accept: nothing at all once the
  // record is sealed to the chain, and never a terminal target otherwise.
  const availableActions = card.sealed
    ? []
    : STATUS_ACTIONS.filter((a) => a.status !== card.status && !TERMINAL_STATUSES.has(a.status));

  return (
    <div
      draggable={!card.sealed}
      title={card.sealed ? "Sealed to the hash chain — this record cannot be moved" : undefined}
      className="relative flex w-full min-h-[186px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-[14px] px-4 py-[15px] shadow-card transition-[box-shadow] duration-[120ms] hover:shadow-card-hover"
      style={{ background: `linear-gradient(to top left, color-mix(in srgb, ${accent} 9%, var(--surface)) 0%, var(--surface) 55%)` }}
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
          style={{ background: "transparent", border: `1px solid color-mix(in srgb, ${accent} 38%, transparent)`, color: accent }}
        >
          <span className="truncate">{tag}</span>
        </span>
        {riskEntry && card.risk_level !== "low" && (
          <Chip label={riskEntry.label} tone={riskEntry.tone} title={riskEntry.meaning} size="sm" icon={<RiskIcon />} />
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
        {showCaseId && <p className="font-mono text-[10.5px] text-muted">{card.case_id}</p>}
        <h3 className="mt-0.5 line-clamp-2 text-[14.5px] font-semibold leading-snug text-text break-words">
          {question || card.case_id}
        </h3>
        {summary && <p className="mt-1 text-[12px] leading-snug text-text-2 line-clamp-2">{summary}</p>}
      </div>

      <div className="min-h-1 flex-1" />

      <div className="pointer-events-none relative z-0 flex items-center gap-2 border-t border-[var(--card-line)] pt-[9px]">
        {statusEntry && (
          <Chip label={statusEntry.label} tone={statusEntry.tone} title={statusEntry.meaning} size="sm" />
        )}
        {card.duration_seconds != null && (
          <span className="font-mono text-[10.5px] text-muted">{fmtDuration(card.duration_seconds)}</span>
        )}
        {card.sealed && (
          <span
            title="Sealed to the hash chain — this record can no longer be edited or deleted"
            className="inline-flex items-center gap-1 text-[10.5px] font-medium text-muted"
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="7" width="10" height="7" rx="1.6" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            sealed
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
        style={{ background: "transparent", color: accent, border: `1px solid color-mix(in srgb, ${accent} 42%, transparent)` }}
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
          {card.sealed ? (
            /* Sealed records are immutable by design. Rather than hide that, say
               so — it is the guarantee the product exists to provide. */
            <div className="px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-text-2">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="3" y="7" width="10" height="7" rx="1.6" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>
                Sealed to hash chain
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                This record is on the audit chain. It cannot be edited, moved, or deleted.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
