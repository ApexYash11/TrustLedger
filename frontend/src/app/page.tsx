"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, AgentOut, DecisionListResponse, TaskSummary } from "@/lib/api";
import TaskCard from "@/components/TaskCard";
import Sidebar from "@/components/Sidebar";

const COLUMNS = ["queued", "running", "review_required", "completed"] as const;
const COLUMN_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  review_required: "Review Ready",
  completed: "Completed",
};
const COLUMN_ACCENT: Record<string, string> = {
  queued: "border-t-stone-300",
  running: "border-t-amber-400",
  review_required: "border-t-violet-500",
  completed: "border-t-emerald-500",
};

const AGENT_CHOICES = [
  { label: "Research Agent", name: "ResearchAgent", domain: "deloitte_client_research" },
  { label: "Compliance Bot", name: "ComplianceBot", domain: "regulatory_compliance" },
];

const EMPTY: DecisionListResponse = { total: 0, decisions: [] };

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
      <span className={`h-2 w-2 rounded-full ${accent}`} />
      <span className="text-stone-500">{label}</span>
      <span className="font-semibold text-stone-900">{value}</span>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DecisionListResponse>(EMPTY);
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [modalCol, setModalCol] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskSummary | null>(null);
  const [liveOn, setLiveOn] = useState(false);
  const [q, setQ] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("");

  // Streaming research state
  const [streamOpen, setStreamOpen] = useState(false);
  const [streamTokens, setStreamTokens] = useState("");
  const [streamStatus, setStreamStatus] = useState<string>("");
  const [streamTaskId, setStreamTaskId] = useState<string | null>(null);
  const [streamCaseId, setStreamCaseId] = useState<string | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [promptRunning, setPromptRunning] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);

  const isDraggingRef = useRef(false);

  const refresh = useCallback(() => {
    if (isDraggingRef.current) return;
    const params: Record<string, string | undefined> = {};
    if (q.trim()) params.case_id = q.trim();
    if (riskFilter) params.risk_level = riskFilter;
    api
      .listDecisions(Object.keys(params).length ? params : undefined)
      .then((res) => {
        if (!isDraggingRef.current) setData(res);
      })
      .catch(() => {});
  }, [q, riskFilter]);

  useEffect(() => {
    refresh();
    api.listAgents().then((res) => setAgents(res.agents)).catch(() => {});
    const timer = setInterval(refresh, 10000);
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${base}/api/v1/decisions/stream`);
      es.onopen = () => setLiveOn(true);
      es.onerror = () => setLiveOn(false);
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as { event?: string; task_id?: string; status?: string };
          if (ev.event === "status_changed" && ev.task_id && ev.status) {
            const { task_id, status } = ev;
            setData((prev) => ({
              ...prev,
              decisions: prev.decisions.map((d) => (d.task_id === task_id ? { ...d, status } : d)),
            }));
          } else {
            refresh();
          }
        } catch {
          refresh();
        }
      };
    } catch {}
    return () => {
      clearInterval(timer);
      es?.close();
    };
  }, [refresh]);

  // auto-scroll streaming panel
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamTokens]);

  const applyStatus = (taskId: string, col: string) => {
    const previous = data.decisions.find((d) => d.task_id === taskId)?.status;
    if (previous === col) return;
    setData((prev) => ({
      ...prev,
      decisions: prev.decisions.map((d) => (d.task_id === taskId ? { ...d, status: col } : d)),
    }));
    api.updateDecisionStatus(taskId, col).catch((err: unknown) => {
      const revertStatus = previous ?? col;
      setData((prev) => ({
        ...prev,
        decisions: prev.decisions.map((d) => (d.task_id === taskId ? { ...d, status: revertStatus } : d)),
      }));
      if (err instanceof ApiError && err.status === 409) {
        if (err.code === "TASK_NOT_SEALED") {
          alert(`Cannot move to "${col}": terminal states need a sealed decision record.`);
        } else {
          alert(`Cannot move: this record is sealed to the audit chain.`);
        }
      }
    });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    if (!target) return;
    const taskId = target.task_id;
    api
      .deleteDecision(taskId)
      .then(() => {
        setData((prev) => ({
          total: prev.total - 1,
          decisions: prev.decisions.filter((d) => d.task_id !== taskId),
        }));
        setDeleteTarget(null);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          alert(`Cannot delete "${target.case_id}": sealed to hash chain.`);
        } else if (err instanceof ApiError && err.status === 404) {
          setData((prev) => ({
            total: prev.total - 1,
            decisions: prev.decisions.filter((d) => d.task_id !== taskId),
          }));
          setDeleteTarget(null);
        } else {
          alert(`Delete failed for "${target.case_id}".`);
        }
      });
  };

  const onDrop = (col: string) => {
    if (!dragId) return;
    const taskId = dragId;
    setDragId(null);
    setDragOverCol(null);
    isDraggingRef.current = false;
    applyStatus(taskId, col);
  };

  const [runAgentOpen, setRunAgentOpen] = useState(false);

  const runStreamingResearch = (prompt: string, agentDomain: string) => {
    const text = prompt.trim();
    if (!text) return;
    setPromptRunning(true);
    setStreamOpen(true);
    setStreamTokens("");
    setStreamStatus("Starting research…");
    setStreamTaskId(null);
    setStreamCaseId(null);
    setStreamDone(false);
    // Use real streaming endpoint — works with or without OpenRouter key
    api
      .streamResearch(
        { query: text, agent_domain: agentDomain },
        (ev) => {
          if (ev.type === "status") {
            setStreamStatus(ev.message ?? "");
            if (ev.task_id) {
              setStreamTaskId(ev.task_id);
              if (ev.case_id) setStreamCaseId(ev.case_id);
            }
          } else if (ev.type === "token" && ev.token) {
            setStreamTokens((prev) => prev + ev.token);
          } else if (ev.type === "done") {
            setStreamStatus(`Done — ${ev.outcome ?? ""} (${ev.status ?? ""})`);
            setStreamTaskId(ev.task_id ?? null);
            setStreamCaseId(ev.case_id ?? null);
            setStreamDone(true);
            setPromptRunning(false);
            refresh();
          } else if (ev.type === "error") {
            setStreamStatus(`Error: ${ev.message ?? "failed"}`);
            setPromptRunning(false);
          }
        },
        () => {
          setPromptRunning(false);
        },
      )
      .then(() => {
        setRunAgentOpen(false);
        refresh();
      })
      .catch(() => {
        setPromptRunning(false);
      });
  };

  const addTask = (col: string, title: string, caseType: string, agentDomain: string) => {
    const choice = AGENT_CHOICES.find((a) => a.domain === agentDomain) ?? AGENT_CHOICES[0];
    const registered = agents.find((a) => a.domain === choice.domain);
    const agentId = registered?.agent_id;
    if (!agentId) {
      // Fallback: use streaming endpoint which auto-registers
      runStreamingResearch(title, choice.domain);
      return;
    }
    void col;
    api
      .queueDecision({
        agent_id: agentId,
        case_id: title,
        case_type: caseType || "Market Entry Assessment",
        inputs: { client_name: title, research_question: caseType || title },
      })
      .then(() => refresh())
      .catch(() => {
        runStreamingResearch(title, choice.domain);
      });
  };

  const filtered = data.decisions; // server-filtered via refresh params
  const counts = {
    queued: filtered.filter((d) => d.status === "queued").length,
    running: filtered.filter((d) => d.status === "running").length,
    review: filtered.filter((d) => d.status === "review_required" || d.status === "disputed").length,
    completed: filtered.filter((d) => d.status === "completed").length,
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-white p-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-stone-900">Research Command Center</h1>
            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-stone-500">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${liveOn ? "bg-emerald-500 animate-pulse" : "bg-stone-300"}`} />
              {liveOn ? "Live — card moves in ~1s" : "Live feed connecting…"} · {data.total} records · hash-chained
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRunAgentOpen(true)}
              className="rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-stone-800 hover:bg-stone-50"
            >
              Run agent
            </button>
            <button
              onClick={() => setModalCol("queued")}
              className="rounded-md bg-stone-900 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-stone-700"
            >
              Add Task
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Stat label="Queued" value={counts.queued} accent="bg-stone-400" />
          <Stat label="Running" value={counts.running} accent="bg-amber-400" />
          <Stat label="Review" value={counts.review} accent="bg-violet-500" />
          <Stat label="Completed" value={counts.completed} accent="bg-emerald-500" />
          <div className="ml-auto flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by case ID…"
              className="w-44 rounded-md border border-stone-200 px-2.5 py-1.5 text-xs outline-none focus:border-stone-400"
            />
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs outline-none">
              <option value="">All risk</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* Real streaming prompt bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runStreamingResearch(promptInput, AGENT_CHOICES[0].domain);
          }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/60 p-2 pl-4 shadow-sm"
        >
          <span className="hidden text-xs font-medium text-stone-400 sm:inline">Ask the agent</span>
          <input
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Should Tata Power enter Rajasthan EV charging in FY27?  → streams live via OpenRouter"
            className="flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
          />
          <button
            type="submit"
            disabled={promptRunning || !promptInput.trim()}
            className="rounded-md bg-stone-900 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            {promptRunning ? "Streaming…" : "Run"}
          </button>
          {streamOpen && (
            <button type="button" onClick={() => setStreamOpen((v) => !v)} className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600">
              {streamOpen ? "Hide" : "Show"} stream
            </button>
          )}
        </form>

        {/* Streaming live viewer */}
        {streamOpen && (
          <div className="mb-5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${promptRunning ? "bg-amber-500 animate-pulse" : streamDone ? "bg-emerald-500" : "bg-stone-300"}`} />
                <span className="font-medium text-stone-700">{streamStatus || "Waiting…"}</span>
                {streamCaseId && <span className="text-stone-400">· {streamCaseId}</span>}
              </div>
              <div className="flex items-center gap-2">
                {streamTaskId && (
                  <a href={`/decisions/${streamTaskId}`} className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-stone-700">
                    Open record
                  </a>
                )}
                <button onClick={() => { setStreamOpen(false); setStreamTokens(""); }} className="rounded px-1.5 text-stone-400 hover:text-stone-700">×</button>
              </div>
            </div>
            <div ref={streamRef} className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-white px-4 py-3 font-mono text-[12.5px] leading-relaxed text-stone-700">
              {streamTokens ? streamTokens : <span className="text-stone-400">{promptRunning ? "Agent is thinking… tokens will stream here." : "No output yet — run a prompt above."}</span>}
              {promptRunning && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-stone-900 align-middle" />}
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 bg-stone-50 px-4 py-2 text-[11px] text-stone-500">
              <span>{streamTokens.length ? `${streamTokens.length} chars streamed` : "Live TrustLedger audit record is being written as tokens arrive"}</span>
              {streamDone && streamTaskId && <span className="text-emerald-700">Sealed + hash-chained ✓</span>}
            </div>
          </div>
        )}

        {/* Kanban board */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const cards = filtered.filter((d) => d.status === col || (col === "review_required" && d.status === "disputed"));
            return (
              <section
                key={col}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col);
                }}
                onDragLeave={() => setDragOverCol((c) => (c === col ? null : c))}
                onDrop={() => onDrop(col)}
                className={`rounded-xl border bg-stone-50/60 p-3 transition-colors ${COLUMN_ACCENT[col]} border-t-2 ${dragOverCol === col ? "bg-white ring-1 ring-stone-300" : "border-stone-100"}`}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold text-stone-700">
                    {COLUMN_LABELS[col]}
                    <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-stone-600 shadow-sm">{cards.length}</span>
                  </h2>
                  <button title="Add task" onClick={() => setModalCol(col)} className="rounded px-1.5 text-stone-400 hover:bg-white hover:text-stone-700">+</button>
                </div>
                <div className="space-y-3">
                  {cards.length === 0 && (
                    <div className="rounded-lg border border-dashed border-stone-200 bg-white/60 px-3 py-6 text-center text-xs text-stone-400">No cards — drop here or add one</div>
                  )}
                  {cards.map((card) => (
                    <div
                      key={card.task_id}
                      draggable
                      onDragStart={() => { setDragId(card.task_id); isDraggingRef.current = true; }}
                      onDragEnd={() => { setDragId(null); isDraggingRef.current = false; }}
                      className={`transition-transform ${dragId === card.task_id ? "scale-[0.98] opacity-60" : ""}`}
                    >
                      <TaskCard card={card} onStatusChange={applyStatus} onDelete={setDeleteTarget} />
                    </div>
                  ))}
                  <button
                    onClick={() => setModalCol(col)}
                    className="w-full rounded-lg border border-dashed border-stone-200 bg-white/40 py-3 text-[13px] text-stone-400 hover:border-stone-400 hover:text-stone-600"
                  >
                    Add Task
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[11px] text-stone-400">Tip: type a question above and watch the card move Queued → Running → Completed live. Poll fallback 10s · dispatch 0.7s · SSE instant</p>
      </main>
      {modalCol && <NewTaskModal col={modalCol} onClose={() => setModalCol(null)} onCreate={addTask} />}
      {runAgentOpen && <RunAgentModal running={promptRunning} onClose={() => setRunAgentOpen(false)} onRun={(prompt, domain) => runStreamingResearch(prompt, domain)} />}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-base font-semibold text-stone-900">Delete task?</h2>
            <p className="mb-5 text-[13px] text-stone-500">Delete &quot;{deleteTarget.case_id}&quot;? Sealed records cannot be deleted.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-md border border-stone-200 px-3 py-1.5 text-[13px]">Cancel</button>
              <button onClick={confirmDelete} className="rounded-md bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunAgentModal({ running, onClose, onRun }: { running: boolean; onClose: () => void; onRun: (prompt: string, agentDomain: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [agentDomain, setAgentDomain] = useState(AGENT_CHOICES[0].domain);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold text-stone-900">Run agent <span className="font-normal text-stone-400">streaming</span></h2>
        <p className="mb-4 text-[12px] text-stone-500">Streams live tokens via OpenRouter. Card moves on the board as events are written.</p>
        <label className="mb-1 block text-xs font-medium text-stone-500">Prompt</label>
        <textarea autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="e.g. Should Tata Power enter Rajasthan EV charging in FY27?" className="mb-3 w-full resize-none rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400" />
        <label className="mb-1 block text-xs font-medium text-stone-500">Agent</label>
        <select value={agentDomain} onChange={(e) => setAgentDomain(e.target.value)} className="mb-5 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm outline-none">
          {AGENT_CHOICES.map((a) => (
            <option key={a.domain} value={a.domain}>{a.label}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-stone-200 px-3 py-1.5 text-[13px]">Cancel</button>
          <button disabled={!prompt.trim() || running} onClick={() => onRun(prompt, agentDomain)} className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-40">{running ? "Streaming…" : "Run agent"}</button>
        </div>
      </div>
    </div>
  );
}

function NewTaskModal({ col, onClose, onCreate }: { col: string; onClose: () => void; onCreate: (col: string, title: string, caseType: string, agentDomain: string) => void }) {
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState("");
  const [agentDomain, setAgentDomain] = useState(AGENT_CHOICES[0].domain);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold text-stone-900">New live task <span className="font-normal text-stone-400">streams</span></h2>
        <p className="mb-4 text-[12px] text-stone-500">Creates a live research run. Watch tokens stream above.</p>
        <label className="mb-1 block text-xs font-medium text-stone-500">Title</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Vendor Due Diligence — Acme Corp" className="mb-3 w-full rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400" />
        <label className="mb-1 block text-xs font-medium text-stone-500">Case type</label>
        <input value={caseType} onChange={(e) => setCaseType(e.target.value)} placeholder="e.g. Due Diligence" className="mb-3 w-full rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400" />
        <label className="mb-1 block text-xs font-medium text-stone-500">Agent</label>
        <select value={agentDomain} onChange={(e) => setAgentDomain(e.target.value)} className="mb-5 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm outline-none">
          {AGENT_CHOICES.map((a) => (
            <option key={a.domain} value={a.domain}>{a.label}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-stone-200 px-3 py-1.5 text-[13px]">Cancel</button>
          <button disabled={!title.trim()} onClick={() => { onCreate(col, title.trim(), caseType.trim(), agentDomain); onClose(); }} className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-40">Queue live task</button>
        </div>
      </div>
    </div>
  );
}
