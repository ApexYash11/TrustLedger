"use client";

import { OUTCOME, RISK, lookup } from "@/lib/vocab";
import { looksStructured, readProgress } from "@/lib/streamProgress";
import Chip, { RiskIcon } from "@/components/Chip";

/**
 * Live view of a research run.
 *
 * The agent answers in a single JSON object, so streaming its tokens verbatim
 * showed the reader `"content_summary": "Analysis of compliance risks…",` rather
 * than progress. This renders the fields that have finished arriving, and keeps
 * the raw buffer behind a toggle for anyone who wants it.
 */
export default function StreamProgress({
  raw,
  running,
  showRaw,
}: {
  raw: string;
  running: boolean;
  showRaw: boolean;
}) {
  if (!raw) {
    return (
      <p className="text-[13px] text-muted">
        {running ? "Agent is thinking…" : "No output yet — ask a question above."}
      </p>
    );
  }

  // The offline template path streams readable step lines already; only the
  // model's JSON needs interpreting.
  if (showRaw || !looksStructured(raw)) {
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-text-2">
        {raw}
        {running && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-ink align-middle" />}
      </pre>
    );
  }

  const p = readProgress(raw);
  const outcomeEntry = lookup(OUTCOME, p.outcome);
  const riskEntry = lookup(RISK, p.risk);

  return (
    <div className="space-y-3 text-[13px]">
      <p className="flex items-center gap-2 text-xs font-medium text-text-2">
        {running && <span className="size-1.5 animate-pulse rounded-full bg-ink" />}
        {p.stage}
      </p>

      {(p.primaryReason || p.outcomeSummary) && (
        <p className="leading-relaxed text-text">{p.outcomeSummary ?? p.primaryReason}</p>
      )}

      {p.factors.length > 0 && (
        <ul className="space-y-1">
          {p.factors.map((f, i) => (
            <li key={i} className="flex gap-2 leading-snug text-text-2">
              <span className="text-muted">—</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {p.sources.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Sources · {p.sources.length}
          </p>
          <ul className="mt-1.5 space-y-1">
            {p.sources.map((s, i) => (
              <li key={i} className="flex gap-2 leading-snug">
                <span style={{ color: "var(--info)" }}>✓</span>
                <span className="min-w-0">
                  <span className="text-text">{s.title}</span>
                  {s.source && <span className="text-muted"> · {s.source}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.policies.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Standards · {p.policies.length}
          </p>
          <ul className="mt-1.5 space-y-1">
            {p.policies.map((s, i) => (
              <li key={i} className="flex gap-2 leading-snug">
                <span style={{ color: "var(--warn)" }}>✓</span>
                <span className="min-w-0">
                  <span className="text-text">{s.title}</span>
                  {s.source && <span className="text-muted"> · {s.source}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(outcomeEntry || riskEntry) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          {outcomeEntry && (
            <Chip label={outcomeEntry.label} tone={outcomeEntry.tone} title={outcomeEntry.meaning} size="sm" />
          )}
          {riskEntry && (
            <Chip label={riskEntry.label} tone={riskEntry.tone} title={riskEntry.meaning} size="sm" icon={<RiskIcon size={10} />} />
          )}
          {p.confidence != null && (
            <span className="font-mono text-[11px] text-muted">{Math.round(p.confidence * 100)}% confidence</span>
          )}
        </div>
      )}
    </div>
  );
}
