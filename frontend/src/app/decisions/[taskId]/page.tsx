"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DecisionTimeline from "@/components/DecisionTimeline";
import IntegrityPanel from "@/components/IntegrityPanel";
import ReplayViewer from "@/components/ReplayViewer";
import Sidebar from "@/components/Sidebar";
import { api, FullDecisionRecord } from "@/lib/api";

const TABS = ["Summary", "Decision Trail", "Replay", "Integrity"] as const;
type Tab = (typeof TABS)[number];
type TaskData = { task_id?: string; case_id?: string; case_type?: string; status?: string; risk_level?: string | null; human_review_status?: string | null; inputs?: Record<string, unknown>; created_at?: string; completed_at?: string | null };
type DecisionData = { decision_id?: string; outcome?: string; outcome_summary?: string; structured_rationale?: { primary_reason?: string }; confidence_score?: number | null; decided_at?: string };

function label(value?: string | null) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Not available";
}

function timestamp(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function Summary({ record }: { record: FullDecisionRecord }) {
  const task = record.task as TaskData;
  const decision = record.decision as DecisionData | null;
  const inputs = Object.entries(task.inputs ?? {});
  return <div className="space-y-5">
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Decision</p>
      {decision ? <>
        <h2 className="mt-2 text-lg font-semibold text-stone-900">{label(decision.outcome)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{decision.outcome_summary}</p>
        {decision.structured_rationale?.primary_reason && <p className="mt-4 border-l-2 border-stone-300 pl-3 text-sm leading-relaxed text-stone-700"><span className="font-medium">Primary reason: </span>{decision.structured_rationale.primary_reason}</p>}
      </> : <p className="mt-2 text-sm text-stone-500">No decision has been recorded yet.</p>}
    </section>
    <div className="grid grid-cols-2 gap-5">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Agent</h2><p className="mt-3 font-medium text-stone-900">{String(record.agent.name ?? "Unknown agent")}</p><p className="mt-1 text-sm text-stone-600">Version: {String(record.agent.version ?? "Not available")}</p><p className="mt-1 text-sm text-stone-600">Domain: {String(record.agent.domain ?? "Not available")}</p></section>
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Review &amp; timing</h2><p className="mt-3 text-sm text-stone-700"><span className="font-medium">Human review: </span>{label(task.human_review_status)}</p><p className="mt-2 text-sm text-stone-700"><span className="font-medium">Created: </span>{timestamp(task.created_at)}</p>{decision?.decided_at && <p className="mt-2 text-sm text-stone-700"><span className="font-medium">Decided: </span>{timestamp(decision.decided_at)}</p>}{decision?.confidence_score != null && <p className="mt-2 text-sm text-stone-700"><span className="font-medium">Confidence: </span>{Math.round(decision.confidence_score * 100)}%</p>}</section>
    </div>
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Case inputs</h2>{inputs.length ? <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">{inputs.map(([key, value]) => <div key={key}><dt className="text-stone-500">{label(key)}</dt><dd className="mt-1 break-words font-medium text-stone-800">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl> : <p className="mt-3 text-sm text-stone-500">No case inputs were recorded.</p>}</section>
    <div className="grid grid-cols-2 gap-5">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Evidence used ({record.evidence.length})</h2><ul className="mt-3 space-y-3 text-sm">{record.evidence.map((item) => <li key={item.evidence_id}><p className="font-medium text-stone-800">{item.title}</p><p className="mt-1 text-stone-600">{item.content_summary}</p></li>)}</ul></section>
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Policies referenced ({record.policy_references.length})</h2><ul className="mt-3 space-y-3 text-sm">{record.policy_references.map((item) => <li key={item.policy_id}><p className="font-medium text-stone-800">{item.policy_code} · {item.section}</p><p className="mt-1 text-stone-600">{item.title}</p></li>)}</ul></section>
    </div>
  </div>;
}

export default function DecisionDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params?.taskId;
  const [record, setRecord] = useState<FullDecisionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Summary");
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set<Tab>(["Summary"]));
  useEffect(() => { if (!taskId) return; setRecord(null); setError(null); api.getDecision(taskId).then(setRecord).catch(() => setError("Unable to load this decision. Please try again.")); }, [taskId]);
  const selectTab = (nextTab: Tab) => { setTab(nextTab); setVisitedTabs((previous) => new Set(previous).add(nextTab)); };
  if (error) return <main className="p-8 text-red-700" role="alert">{error}</main>;
  if (!record) return <main className="p-8 text-stone-500">Loading decision…</main>;
  const task = record.task as TaskData;
  return <div className="flex min-h-screen min-w-[1024px]">
    <Sidebar />
    <main className="flex-1 bg-white p-8"><div className="mx-auto max-w-5xl">
      <a href="/" className="text-sm font-medium text-stone-600 hover:text-stone-900">← Back to Command Center</a>
      <div className="mt-5 border-b border-stone-200 pb-5"><p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Decision Overview</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{task.case_id ?? taskId}</h1><p className="mt-1 text-sm text-stone-600">{task.case_type ?? "Decision record"}</p><div className="mt-3 flex gap-2 text-xs font-medium"><span className="rounded border border-stone-200 bg-stone-100 px-2 py-1 text-stone-700">Status: {label(task.status)}</span>{task.risk_level && <span className="rounded border border-stone-200 bg-stone-100 px-2 py-1 text-stone-700">Risk: {label(task.risk_level)}</span>}</div></div>
      <div className="mt-6 border-b border-stone-200" role="tablist" aria-label="Decision overview sections">{TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => selectTab(item)} className={`mr-6 border-b-2 px-1 pb-3 text-sm font-medium ${tab === item ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"}`}>{item}</button>)}</div>
      <div className="py-6" role="tabpanel">{tab === "Summary" && <Summary record={record} />}{tab === "Decision Trail" && <DecisionTimeline events={record.events} />}{visitedTabs.has("Replay") && <div hidden={tab !== "Replay"}><ReplayViewer taskId={taskId} /></div>}{visitedTabs.has("Integrity") && <div hidden={tab !== "Integrity"}><IntegrityPanel taskId={taskId} /></div>}</div>
    </div></main>
  </div>;
}
