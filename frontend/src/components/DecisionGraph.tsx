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
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Knowledge graph</h2>
        <p className="mt-3 text-sm text-stone-500">Graph will appear once the decision is sealed — evidence and policy nodes link to the recommendation.</p>
        <div className="mt-4 flex gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <span className="text-xs text-stone-400">Agent is still reasoning…</span>
        </div>
      </div>
    );
  }

  const evs = evidences.slice(0, 3);
  const pols = policies.slice(0, 2);

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Knowledge graph — how the decision links</h2>
        <p className="mt-1 text-xs text-stone-500">Nodes = entities, edges = typed relationships (supports / applies_to / validates). Every fact has a source.</p>
      </div>

      {/* SVG + nodes */}
      <div className="relative bg-stone-50 p-4">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 720 320" preserveAspectRatio="none" aria-hidden>
          {/* Client -> Question */}
          <line x1="115" y1="160" x2="210" y2="160" stroke="#a8a29e" strokeWidth="1.2" strokeDasharray="4 4" />
          {/* Question -> Evidence cluster */}
          {evs.map((_, i) => {
            const ey = 85 + i * 52;
            return <line key={`e-${i}`} x1="410" y1="160" x2="500" y2={ey} stroke="#f59e0b" strokeWidth="1" opacity="0.7" />;
          })}
          {/* Question -> Policy cluster */}
          {pols.map((_, i) => {
            const py = 225 + i * 42;
            return <line key={`p-${i}`} x1="410" y1="160" x2="500" y2={py} stroke="#8b5cf6" strokeWidth="1" opacity="0.7" />;
          })}
          {/* Evidence+Policy -> Outcome */}
          <line x1="620" y1="115" x2="635" y2="160" stroke="#a8a29e" strokeWidth="1" />
          <line x1="620" y1="245" x2="635" y2="160" stroke="#a8a29e" strokeWidth="1" />
        </svg>

        {/* Client */}
        <div className="absolute left-4 top-[138px] rounded-lg border border-stone-300 bg-white px-3 py-2 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Client</p>
          <p className="max-w-[130px] truncate text-xs font-medium text-stone-800">{client}</p>
        </div>

        {/* Question */}
        <div className="absolute left-[222px] top-[132px] w-[190px] rounded-xl border-2 border-stone-900 bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Research question</p>
          <p className="mt-0.5 line-clamp-3 text-xs font-semibold leading-snug text-stone-900">{question}</p>
        </div>

        {/* Evidence stack */}
        <div className="absolute right-4 top-3 space-y-2">
          {evs.length ? evs.map((ev, i) => (
            <div key={ev.evidence_id ?? i} className="w-[160px] rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
              <p className="truncate text-[11px] font-semibold text-stone-800">{ev.title}</p>
              <p className="truncate text-[10px] text-stone-500">{ev.source}</p>
              <span className="mt-1 inline-block rounded bg-white px-1 py-0.5 text-[10px] font-medium text-amber-700">supports →</span>
            </div>
          )) : (
            <div className="w-[160px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-400">No evidence yet</div>
          )}
        </div>

        {/* Policy stack */}
        <div className="absolute right-4 bottom-3 space-y-2">
          {pols.length ? pols.map((p, i) => (
            <div key={p.policy_id ?? i} className="w-[160px] rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2">
              <p className="truncate text-[11px] font-semibold text-stone-800">§ {p.section} {p.title && `· ${p.title}`}</p>
              <p className="truncate text-[10px] text-stone-500">{p.policy_code}</p>
              <span className="mt-1 inline-block rounded bg-white px-1 py-0.5 text-[10px] font-medium text-violet-700">applies_to →</span>
            </div>
          )) : (
            <div className="w-[160px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-400">No policy yet</div>
          )}
        </div>

        {/* Outcome */}
        <div className="absolute right-[32px] top-[138px] rounded-xl border-2 border-stone-900 bg-stone-900 px-3 py-2.5 text-white shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Recommendation</p>
          <p className="mt-0.5 max-w-[110px] text-xs font-semibold capitalize leading-snug">{outcome}</p>
        </div>

        {/* Spacer for height */}
        <div className="h-[290px]" />
      </div>

      <div className="flex gap-3 border-t border-stone-100 bg-white px-5 py-2.5 text-[11px]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Evidence supports</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> Methodology applies_to</span>
        <span className="ml-auto text-stone-400">Sealed record #{record.audit_record?.chain_sequence ?? "—"}</span>
      </div>
    </div>
  );
}
