"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DecisionGraph from "@/components/DecisionGraph";
import DecisionTimeline from "@/components/DecisionTimeline";
import IntegrityPanel from "@/components/IntegrityPanel";
import ReplayViewer from "@/components/ReplayViewer";
import Sidebar from "@/components/Sidebar";
import { api, FullDecisionRecord } from "@/lib/api";
import { formatTimestamp, humanize } from "@/lib/format";

const clean = (s: string) => s.replace(/—/g, "-").replace(/–/g, "-");

const RISK: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-red-100 text-red-700 border-red-200",
};
const OUTCOME_ICON: Record<string, string> = {
  recommended: "✓",
  recommended_with_caveats: "◐",
  not_recommended: "✕",
  escalated: "↑",
};

const TABS = ["Summary", "Decision Trail", "Replay", "Integrity"] as const;
type Tab = (typeof TABS)[number];
type TaskData = { task_id?: string; case_id?: string; case_type?: string; status?: string; risk_level?: string | null; human_review_status?: string | null; inputs?: Record<string, unknown>; created_at?: string; completed_at?: string | null; };
type DecisionData = { outcome?: string; outcome_summary?: string; structured_rationale?: { primary_reason?: string; supporting_factors?: string[]; policy_basis?: string[]; evidence_basis?: string[]; exclusions_applied?: string[] }; confidence_score?: number | null; decided_at?: string; };

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <section className={`rounded-xl border bg-white p-5 shadow-sm ${accent ?? "border-stone-200"}`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">{title}</h2>
      {children}
    </section>
  );
}

function Summary({ record }: { record: FullDecisionRecord }) {
  const task = record.task as TaskData;
  const decision = record.decision as DecisionData | null;
  const inputs = Object.entries(task.inputs ?? {});
  const conf = decision?.confidence_score != null ? Math.round(decision.confidence_score * 100) : null;

  return (
    <div className="space-y-4">
      {/* Hero outcome */}
      <div className="overflow-hidden rounded-xl border border-stone-900 bg-stone-900 text-white">
        <div className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Recommendation</p>
          {decision ? (
            <>
              <div className="mt-2 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-stone-900 font-bold">{OUTCOME_ICON[decision.outcome ?? ""] ?? "•"}</span>
                <div>
                  <h3 className="text-xl font-semibold leading-tight">{humanize(decision.outcome)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-300">{decision.outcome_summary}</p>
                </div>
              </div>
              {decision.structured_rationale?.primary_reason && (
                <div className="mt-4 rounded-lg bg-white/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-stone-300">Why — in one sentence</p>
                  <p className="mt-1 text-sm leading-relaxed text-white">{decision.structured_rationale.primary_reason}</p>
                </div>
              )}
              {conf != null && (
                <div className="mt-4 flex items-center gap-3 text-xs text-stone-400">
                  <span>Confidence</span>
                  <div className="h-1.5 flex-1 max-w-[160px] rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${conf}%` }} /></div>
                  <span className="font-medium text-white">{conf}%</span>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-400">No decision yet — this task is still {humanize(task.status)}.</p>
          )}
        </div>
        <div className="flex gap-2 border-t border-white/10 bg-white/[0.04] px-6 py-3 text-xs">
          <span className="text-stone-400">Human review</span><span className="font-medium text-white">{humanize(task.human_review_status)}</span>
          <span className="mx-2 text-stone-600">·</span>
          <span className="text-stone-400">Decided</span><span className="font-medium text-white">{decision?.decided_at ? formatTimestamp(decision.decided_at) : "—"}</span>
        </div>
      </div>

      <DecisionGraph record={record} />

      <Card title="What was asked">
        {(() => {
          const q = String(task.inputs?.research_question ?? task.inputs?.prompt ?? task.case_id ?? "");
          const client = String(task.inputs?.client_name ?? "");
          const rows: [string, string][] = [];
          if (q) rows.push(["Research question", q]);
          if (client && client !== q) rows.push(["Client", client]);
          rows.push(["Case type", String(task.case_type ?? "Prompt run")]);
          return (
            <dl className="mt-3 space-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex gap-3"><dt className="w-36 shrink-0 text-stone-500">{k}</dt><dd className="font-medium text-stone-800 break-words">{v}</dd></div>
              ))}
            </dl>
          );
        })()}
      </Card>

      {/* Supporting factors */}
      {decision?.structured_rationale?.supporting_factors && decision.structured_rationale.supporting_factors.length > 0 && (
        <Card title="Why these factors matter">
          <ul className="mt-3 space-y-2 text-sm">
            {decision.structured_rationale.supporting_factors.map((f, i) => (
              <li key={i} className="flex gap-2"><span className="text-stone-400">—</span><span className="text-stone-700">{f}</span></li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title={`Evidence · ${record.evidence.length}`}>
          {record.evidence.length ? (
            <ul className="mt-3 space-y-3 text-sm">
              {record.evidence.map((it) => (
                <li key={it.evidence_id} className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5">
                  <p className="font-medium text-stone-800">{it.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{it.source} · {it.evidence_type.replace(/_/g," ")}</p>
                  <p className="mt-1.5 text-stone-600 leading-relaxed">{it.content_summary}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-stone-500">No evidence cited.</p>}
        </Card>
        <Card title={`Methodology · ${record.policy_references.length}`}>
          {record.policy_references.length ? (
            <ul className="mt-3 space-y-3 text-sm">
              {record.policy_references.map((it) => (
                <li key={it.policy_id} className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                  <p className="font-medium text-stone-800">§ {it.section} · {it.title}</p>
                  <p className="text-xs text-stone-500">{it.policy_code}</p>
                  <p className="mt-1.5 text-stone-600 italic">&ldquo;{it.text_excerpt}&rdquo;</p>
                  <p className="mt-1.5 text-xs font-medium text-violet-700">Applied: {it.application}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-stone-500">No methodology cited.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Agent">
          <p className="mt-3 font-medium text-stone-900">{String(record.agent.name ?? "Unknown")}</p>
          <p className="mt-1 text-xs text-stone-500">{String(record.agent.domain ?? "")} · v{String(record.agent.version ?? "")}</p>
        </Card>
        <Card title="Timing">
          <p className="mt-3 text-sm"><span className="text-stone-500">Created</span> <span className="font-medium text-stone-800">{formatTimestamp(task.created_at)}</span></p>
          {task.completed_at && <p className="mt-1 text-sm"><span className="text-stone-500">Completed</span> <span className="font-medium text-stone-800">{formatTimestamp(task.completed_at)}</span></p>}
        </Card>
      </div>
    </div>
  );
}

export default function DecisionDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params?.taskId;
  const [record, setRecord] = useState<FullDecisionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Summary");
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(["Summary"]));

  useEffect(() => {
    if (!taskId) return;
    setRecord(null); setError(null);
    api.getDecision(taskId).then(setRecord).catch(() => setError("Unable to load this decision."));
  }, [taskId]);

  const select = (t: Tab) => { setTab(t); setVisited((p) => new Set(p).add(t)); };

  if (error) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 p-8 text-sm text-red-700">{error}</main></div>;
  if (!record) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 p-8 text-sm text-stone-500">Loading decision…</main></div>;

  const task = record.task as TaskData;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-stone-50 p-8">
        <div className="mx-auto max-w-5xl">
          <a href="/" className="text-xs font-medium text-stone-500 hover:text-stone-800">← Back to board</a>
          <div className="mt-3 rounded-xl border border-stone-200 bg-white px-6 py-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Decision record · tamper-evident</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{task.case_id ?? taskId}</h1>
            <p className="mt-1 text-sm text-stone-600">{task.case_type ? clean(task.case_type) : "Research task"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {task.status && <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">{humanize(task.status)}</span>}
              {task.risk_level && <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${RISK[task.risk_level] ?? "border-stone-200 bg-stone-100 text-stone-600"}`}>{task.risk_level}</span>}
              {task.human_review_status && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{humanize(task.human_review_status)}</span>}
            </div>
          </div>

          <div className="mt-4 border-b border-stone-200" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => select(t)} className={`mr-6 border-b-2 px-1 pb-3 text-sm font-medium ${tab === t ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"}`}>{t}</button>
            ))}
          </div>

          <div className="py-6" role="tabpanel">
            {tab === "Summary" && <Summary record={record} />}
            {tab === "Decision Trail" && <DecisionTimeline events={record.events} />}
            {visited.has("Replay") && <div hidden={tab !== "Replay"}><ReplayViewer taskId={taskId!} /></div>}
            {visited.has("Integrity") && <div hidden={tab !== "Integrity"}><IntegrityPanel taskId={taskId!} /></div>}
          </div>
        </div>
      </main>
    </div>
  );
}
