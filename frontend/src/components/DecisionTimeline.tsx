"use client";

import type { EventOut } from "@/lib/api";
import { formatTimestamp, humanize } from "@/lib/format";

type EvidenceDetail = { title?: string; content_summary?: string };
type PolicyDetail = { section?: string; title?: string; application?: string };

export default function DecisionTimeline({ events }: { events: EventOut[] }) {
  if (!events.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">
        No decision events have been recorded yet.
      </p>
    );
  }

  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  return (
    <ol aria-label="Decision event timeline">
      {sorted.map((event) => {
        const evidence = event.details?.evidence as EvidenceDetail | undefined;
        const policy = event.details?.policy_reference as PolicyDetail | undefined;
        const sealed = event.event_type === "record_sealed";

        return (
          <li key={event.event_id} className="flex gap-4 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                sealed ? "bg-ink text-ink-fg" : "bg-hover text-text-2"
              }`}
            >
              {event.sequence}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-semibold text-text">{humanize(event.event_type)}</h3>
                <time className="shrink-0 text-xs text-muted">{formatTimestamp(event.timestamp)}</time>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-text-2">{event.summary}</p>
              <p className="mt-1 text-xs text-muted">Recorded by {event.actor}</p>

              {evidence && (
                <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-sm">
                  <p className="font-medium text-text">Evidence: {evidence.title ?? "Untitled evidence"}</p>
                  {evidence.content_summary && <p className="mt-1 text-text-2">{evidence.content_summary}</p>}
                </div>
              )}
              {policy && (
                <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-sm">
                  <p className="font-medium text-text">
                    Policy: {[policy.section, policy.title].filter(Boolean).join(" - ") || "Referenced policy"}
                  </p>
                  {policy.application && <p className="mt-1 text-ink font-medium">Applied: {policy.application}</p>}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
