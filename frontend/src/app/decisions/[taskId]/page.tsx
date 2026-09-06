"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, FullDecisionRecord, ReplayResponse, VerifyResponse } from "@/lib/api";
import DecisionTimeline from "@/components/DecisionTimeline";
import ReplayViewer from "@/components/ReplayViewer";
import IntegrityPanel from "@/components/IntegrityPanel";
type Tab = "summary" | "trail" | "replay" | "integrity";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "trail", label: "Decision Trail" },
  { id: "replay", label: "Replay" },
  { id: "integrity", label: "Integrity" },
];
export default function DecisionDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params?.taskId;
  const [record, setRecord] = useState<FullDecisionRecord | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  useEffect(() => {
    if (!taskId) return;
    api
      .getDecision(taskId)
      .then(setRecord)
      .catch((e) => setError(e.message));
    api
      .getReplay(taskId)
      .then(setReplay)
      .catch(() => setReplay(null));
    api
      .verifyDecision(taskId)
      .then(setVerify)
      .catch(() => setVerify(null));
  }, [taskId]);
  if (error)
    return (
      <main className="p-8 font-serif text-red-700">
        Failed to load decision: {error}
      </main>
    );
  if (!record)
    return <main className="p-8 font-serif text-stone-400">Loading…</main>;
  const task = record.task as {
    case_id?: string;
    case_type?: string;
    status?: string;
  };
  const decision = record.decision as
    | { outcome?: string; outcome_summary?: string }
    | null;
  return (
    <main className="min-h-screen bg-[#faf9f7] text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-10 font-serif">
        <header className="pb-6 border-b border-stone-200">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
            {task.case_type} · {task.status}
          </p>
          <h1 className="text-3xl mt-2 tracking-tight">{task.case_id}</h1>
        </header>
        <nav className="flex gap-6 mt-6 border-b border-stone-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 text-sm tracking-wide transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? "border-stone-900 text-stone-900"
                  : "border-transparent text-stone-400 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <section className="py-8">
          {tab === "summary" && (
            <div>
              {decision ? (
                <>
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                    Outcome
                  </p>
                  <p className="text-xl mt-1">
                    {decision.outcome?.replace(/_/g, " ")}
                  </p>
                  <p className="mt-3 text-stone-600 leading-relaxed">
                    {decision.outcome_summary}
                  </p>
                </>
              ) : (
                <p className="text-stone-400">No decision recorded yet.</p>
              )}
            </div>
          )}
          {tab === "trail" && <DecisionTimeline events={record.events} />}
          {tab === "replay" &&
            (replay ? (
              <ReplayViewer replay={replay} />
            ) : (
              <p className="text-stone-400 text-sm italic">Replay unavailable.</p>
            ))}
          {tab === "integrity" && (
            <IntegrityPanel taskId={taskId ?? ""} initial={verify} />
          )}
        </section>
      </div>
    </main>
  );
}