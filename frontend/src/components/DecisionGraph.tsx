"use client";

import type { FullDecisionRecord } from "@/lib/api";

export default function DecisionGraph({ record }: { record: FullDecisionRecord }) {
  const task = record.task as any;
  const decision = record.decision as any;
  const question: string = task.inputs?.research_question ?? task.inputs?.prompt ?? task.case_id ?? "Research question";
  const client: string = task.inputs?.client_name ?? "Client";
  const outcome: string = decision?.outcome ? decision.outcome.replace(/_/g, " ") : task.status ?? "pending";
  const evidences: any[] = record.evidence ?? [];
  const policies: any[] = record.policy_references ?? [];

  // Running state: show skeleton
  if (!decision) {
    return (
      <div className="rounded-[14px] border border-border bg-surface p-5 shadow-card">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">Knowledge graph</h2>
        <p className="mt-3 text-sm text-text-2">Graph will appear once the decision is sealed — evidence and policy nodes link to the recommendation.</p>
        <div className="mt-4 flex gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
          <span className="text-xs text-muted">Agent is still reasoning…</span>
        </div>
      </div>
    );
  }

  const evs = evidences.slice(0, 3);
  const pols = policies.slice(0, 2);

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">Knowledge graph — how the decision links</h2>
        <p className="mt-1 text-xs text-muted">Nodes = entities, edges = typed relationships (supports / applies_to / validates). Every fact has a source.</p>
      </div>

      {/* SVG + nodes */}
      <div className="relative bg-surface-2 p-4">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 720 320" preserveAspectRatio="none" aria-hidden>
          {/* Client -> Question */}
          <line x1="115" y1="160" x2="210" y2="160" stroke="#c8c4bc" strokeWidth="1.2" strokeDasharray="4 4" />
          {/* Question -> Evidence cluster */}
          {evs.map((_, i) => {
            const ey = 85 + i * 52;
            return <line key={`e-${i}`} x1="410" y1="160" x2="500" y2={ey} stroke="#a8a49c" strokeWidth="1" opacity="0.7" />;
          })}
          {/* Question -> Policy cluster */}
          {pols.map((_, i) => {
            const py = 225 + i * 42;
            return <line key={`p-${i}`} x1="410" y1="160" x2="500" y2={py} stroke="#57534d" strokeWidth="1" opacity="0.7" />;
          })}
          {/* Evidence+Policy -> Outcome */}
          <line x1="620" y1="115" x2="635" y2="160" stroke="#c8c4bc" strokeWidth="1" />
          <line x1="620" y1="245" x2="635" y2="160" stroke="#c8c4bc" strokeWidth="1" />
        </svg>

        {/* Client */}
        <div className="absolute left-4 top-[138px] rounded-lg border border-border bg-surface px-3 py-2 shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Client</p>
          <p className="max-w-[130px] truncate text-xs font-medium text-text">{client}</p>
        </div>

        {/* Question */}
        <div className="absolute left-[222px] top-[132px] w-[190px] rounded-xl border-2 border-ink bg-surface px-3 py-2.5 shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Research question</p>
          <p className="mt-0.5 line-clamp-3 text-xs font-semibold leading-snug text-text">{question}</p>
        </div>

        {/* Evidence stack */}
        <div className="absolute right-4 top-3 space-y-2">
          {evs.length ? (
            evs.map((ev, i) => (
              <div key={ev.evidence_id ?? i} className="w-[160px] rounded-lg border border-[rgba(28,27,26,.18)] bg-surface px-2.5 py-2 shadow-card">
                <p className="truncate text-[11px] font-semibold text-text">{ev.title}</p>
                <p className="truncate text-[10px] text-muted">{ev.source}</p>
                <span className="mt-1 inline-block rounded bg-surface-2 px-1 py-0.5 text-[10px] font-medium text-text-2">supports →</span>
              </div>
            ))
          ) : (
            <div className="w-[160px] rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">No evidence yet</div>
          )}
        </div>

        {/* Policy stack */}
        <div className="absolute right-4 bottom-3 space-y-2">
          {pols.length ? (
            pols.map((p, i) => (
              <div key={p.policy_id ?? i} className="w-[160px] rounded-lg border border-[rgba(28,27,26,.18)] bg-surface px-2.5 py-2 shadow-card">
                <p className="truncate text-[11px] font-semibold text-text">§ {p.section} {p.title && `· ${p.title}`}</p>
                <p className="truncate text-[10px] text-muted">{p.policy_code}</p>
                <span className="mt-1 inline-block rounded bg-surface-2 px-1 py-0.5 text-[10px] font-medium text-text-2">applies_to →</span>
              </div>
            ))
          ) : (
            <div className="w-[160px] rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">No policy yet</div>
          )}
        </div>

        {/* Outcome */}
        <div className="absolute right-[32px] top-[138px] rounded-xl border-2 border-ink bg-ink px-3 py-2.5 text-ink-fg shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[rgba(245,243,240,.5)]">Recommendation</p>
          <p className="mt-0.5 max-w-[110px] text-xs font-semibold capitalize leading-snug">{outcome}</p>
        </div>

        {/* Spacer for height */}
        <div className="h-[290px]" />
      </div>

      <div className="flex gap-3 border-t border-border bg-surface px-5 py-2.5 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#a8a49c]" /> Evidence supports
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#57534d]" /> Methodology applies_to
        </span>
        <span className="ml-auto text-muted">Sealed record #{record.audit_record?.chain_sequence ?? "—"}</span>
      </div>
    </div>
  );
}
