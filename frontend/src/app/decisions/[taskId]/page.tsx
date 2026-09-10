"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DecisionTimeline from "@/components/DecisionTimeline";
import IntegrityPanel from "@/components/IntegrityPanel";
import ReplayViewer from "@/components/ReplayViewer";
import Sidebar from "@/components/Sidebar";
import { api, FullDecisionRecord } from "@/lib/api";
import { formatTimestamp, humanize } from "@/lib/format";

// Plain dash instead of em-dash (flagged by writing-quality checkers).
const clean = (s: string) => s.replace(/—/g, "-").replace(/–/g, "-");

const RISK_TAGS: Record<string, string> = {
  low: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-red-100 text-red-700 border-red-200",
};


const TABS = ["Summary", "Decision Trail", "Replay", "Integrity"] as const;
type Tab = (typeof TABS)[number];

type TaskData = {
  task_id?: string;
  case_id?: string;
  case_type?: string;
  status?: string;
  risk_level?: string | null;
  human_review_status?: string | null;
  inputs?: Record<string, unknown>;
  created_at?: string;
  completed_at?: string | null;
};

type DecisionData = {
  outcome?: string;
  outcome_summary?: string;
  structured_rationale?: { primary_reason?: string };
  confidence_score?: number | null;
  decided_at?: string;
};

/** Small pill chip matching TaskCard's tag styling. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-stone-200 bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
      {children}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm text-stone-700">
      <span className="font-medium">{label}: </span>
      {children}
    </p>
  );
}

function Summary({ record }: { record: FullDecisionRecord }) {
  const task = record.task as TaskData;
  const decision = record.decision as DecisionData | null;
  const inputs = Object.entries(task.inputs ?? {});

  return (
    <div className="space-y-5">
      <Card title="Decision">
        {decision ? (
          <>
            <h3 className="mt-2 text-lg font-semibold text-stone-900">{humanize(decision.outcome)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{decision.outcome_summary}</p>
            {decision.structured_rationale?.primary_reason && (
              <p className="mt-4 border-l-2 border-stone-300 pl-3 text-sm leading-relaxed text-stone-700">
                <span className="font-medium">Primary reason: </span>
                {decision.structured_rationale.primary_reason}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-stone-500">No decision has been recorded yet.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Agent">
          <p className="mt-3 font-medium text-stone-900">{String(record.agent.name ?? "Unknown agent")}</p>
          <Detail label="Version">{String(record.agent.version ?? "Not available")}</Detail>
          <Detail label="Domain">{String(record.agent.domain ?? "Not available")}</Detail>
        </Card>

        <Card title="Review & timing">
          <Detail label="Human review">{humanize(task.human_review_status)}</Detail>
          <Detail label="Created">{formatTimestamp(task.created_at)}</Detail>
          {decision?.decided_at && <Detail label="Decided">{formatTimestamp(decision.decided_at)}</Detail>}
          {decision?.confidence_score != null && (
            <Detail label="Confidence">{Math.round(decision.confidence_score * 100)}%</Detail>
          )}
        </Card>
      </div>

      <Card title="Case inputs">
        {inputs.length > 0 ? (
          <dl className="mt-3 space-y-2 text-sm">
            {inputs.map(([key, value]) => (
              <div key={key}>
                <dt className="text-stone-500">{humanize(key)}</dt>
                <dd className="mt-0.5 break-words font-medium text-stone-800">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-stone-500">No case inputs were recorded.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card title={`Evidence used (${record.evidence.length})`}>
          <ul className="mt-3 space-y-3 text-sm">
            {record.evidence.map((item) => (
              <li key={item.evidence_id}>
                <p className="font-medium text-stone-800">{item.title}</p>
                <p className="mt-1 text-stone-600">{item.content_summary}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Policies referenced (${record.policy_references.length})`}>
          <ul className="mt-3 space-y-3 text-sm">
            {record.policy_references.map((item) => (
              <li key={item.policy_id}>
                <p className="font-medium text-stone-800">
                  {item.policy_code} - {item.section}
                </p>
                <p className="mt-1 text-stone-600">{item.title}</p>
              </li>
            ))}
          </ul>
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
  // Replay and Integrity fetch lazily, only the first time their tab is opened.
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set<Tab>(["Summary"]));

  useEffect(() => {
    if (!taskId) return;
    setRecord(null);
    setError(null);
    // Live backend only: every card on the board is a real agent task now.
    api
      .getDecision(taskId)
      .then(setRecord)
      .catch(() => setError("Unable to load this decision. Please try again."));
  }, [taskId]);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    setVisitedTabs((previous) => new Set(previous).add(nextTab));
  };

  if (error) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 bg-white p-8 text-sm text-red-700" role="alert">
          {error}
        </main>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 bg-white p-8 text-sm text-stone-500">Loading decision…</main>
      </div>
    );
  }

  const task = record.task as TaskData;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-white p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mt-5 border-b border-stone-200 pb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Decision Overview
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
              {task.case_id ?? taskId}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {task.case_type ? clean(task.case_type) : "Decision record"}
            </p>
            <div className="mt-3 flex gap-2">
              {task.status && <Chip>Status: {humanize(task.status)}</Chip>}
              {task.risk_level && (
                <span
                  className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                    RISK_TAGS[task.risk_level] ?? "border-stone-200 bg-stone-100 text-stone-600"
                  }`}
                >
                  {task.risk_level}
                </span>
              )}
            </div>
          </div>

          <div
            className="mt-6 border-b border-stone-200"
            role="tablist"
            aria-label="Decision overview sections"
          >
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={`tab-${item}`}
                aria-selected={tab === item}
                aria-controls={`panel-${item}`}
                onClick={() => selectTab(item)}
                className={`mr-6 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  tab === item
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-500 hover:text-stone-900"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="py-6"
          >
            {tab === "Summary" && <Summary record={record} />}
            {tab === "Decision Trail" && <DecisionTimeline events={record.events} />}
            {visitedTabs.has("Replay") && (
              <div hidden={tab !== "Replay"}>
                <ReplayViewer taskId={taskId} />
              </div>
            )}
            {visitedTabs.has("Integrity") && (
              <div hidden={tab !== "Integrity"}>
                <IntegrityPanel taskId={taskId} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

