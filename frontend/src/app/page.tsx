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

/** Which backend agent runs a new card. ResearchAgent seals a full live
 *  decision (trail + replay + integrity); ComplianceBot is the second lane. */
const AGENT_CHOICES = [
  { label: "Research Agent", name: "ResearchAgent", domain: "deloitte_client_research" },
  { label: "Compliance Bot", name: "ComplianceBot", domain: "regulatory_compliance" },
];

const EMPTY: DecisionListResponse = { total: 0, decisions: [] };


export default function DashboardPage() {
  const [data, setData] = useState<DecisionListResponse>(EMPTY);
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [modalCol, setModalCol] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskSummary | null>(null);
  const [liveOn, setLiveOn] = useState(false);

  /** Track in-flight drags so the auto-refresh can skip while dragging. */
  const isDraggingRef = useRef(false);

  const refresh = useCallback(() => {
    // Don't overwrite optimistic state while a drag-and-drop is in progress
    if (isDraggingRef.current) return;
    api
      .listDecisions()
      .then((res) => {
        // Guard again in case drag started between fetch and resolve
        if (!isDraggingRef.current) setData(res);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Live agent roster for the New Task modal (falls back to defaults).
    api.listAgents().then((res) => setAgents(res.agents)).catch(() => {});
    const timer = setInterval(refresh, 30000);
    // Live SSE feed (issue #14): in-flight queued -> running -> completed card
    // movement arrives within ~1-3s while the 30s poll stays as a resync fallback.
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
            // Any other hub event (event appended / decision sealed) triggers a
            // lightweight resync; the drag guard inside refresh() still applies.
            refresh();
          }
        } catch {
          refresh();
        }
      };
    } catch {
      // EventSource unavailable (very old browser): polling fallback covers it.
    }
    return () => {
      clearInterval(timer);
      es?.close();
    };
  }, [refresh]);

  const applyStatus = (taskId: string, col: string) => {
    // Capture previous status BEFORE the optimistic update
    const previous = data.decisions.find((d) => d.task_id === taskId)?.status;
    // If the card is dropped on its current column, no-op
    if (previous === col) return;
    // Optimistic local move
    setData((prev) => ({
      ...prev,
      decisions: prev.decisions.map((d) =>
        d.task_id === taskId ? { ...d, status: col } : d
      ),
    }));
    // Persist to backend so the next refresh keeps the card in its new column
    api.updateDecisionStatus(taskId, col).catch((err: unknown) => {
      // Always revert on failure - don't gate on previous truthiness
      const revertStatus = previous ?? col;
      setData((prev) => ({
        ...prev,
        decisions: prev.decisions.map((d) =>
          d.task_id === taskId ? { ...d, status: revertStatus } : d
        ),
      }));
      // Show user-visible feedback for sealed-record / terminal-state rejection
      if (err instanceof ApiError && err.status === 409) {
        if (err.code === "TASK_NOT_SEALED") {
          alert(
            `Cannot move "${taskId}" to "${col}": terminal states need a sealed decision record. Complete the task from its detail page instead.`
          );
        } else {
          alert(`Cannot move "${taskId}": this record is sealed to the audit chain.`);
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
          alert(`Cannot delete "${target.case_id}": this record is sealed to the audit chain.`);
        } else if (err instanceof ApiError && err.status === 404) {
          // Already gone server-side: drop it locally to stay in sync.
          setData((prev) => ({
            total: prev.total - 1,
            decisions: prev.decisions.filter((d) => d.task_id !== taskId),
          }));
          setDeleteTarget(null);
        } else {
          alert(`Delete failed for "${target.case_id}". Please try again.`);
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
  const [promptRunning, setPromptRunning] = useState(false);

  // Prompt -> live agent: queue a REAL task on the backend. The dispatcher
  // claims it in ~2s, the agent streams ledger events, and the card moves
  // Queued -> Running -> Completed/Review live over SSE (no placeholders).
  const runPromptTask = (prompt: string, agentDomain: string) => {
    const text = prompt.trim();
    if (!text) return;
    const choice = AGENT_CHOICES.find((a) => a.domain === agentDomain) ?? AGENT_CHOICES[0];
    const registered = agents.find((a) => a.domain === choice.domain);
    const agentId = registered?.agent_id;
    if (!agentId) {
      alert(
        `No "${choice.label}" registered on the backend yet. ` +
          `Register via POST /api/v1/agents (name=${choice.name}, domain=${choice.domain}), then try again.`
      );
      return;
    }
    setPromptRunning(true);
    api
      .queueDecision({
        agent_id: agentId,
        case_id: text.length > 80 ? text.slice(0, 80) : text,
        case_type: "Prompt run",
        inputs: {
          client_name: text.length > 80 ? text.slice(0, 80) : text,
          research_question: text,
        },
      })
      .then(() => {
        setRunAgentOpen(false);
        refresh();
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          alert("Agent not found on the backend - refresh and try again.");
        } else {
          alert("Could not queue this task on the backend. Is the API running?");
        }
      })
      .finally(() => setPromptRunning(false));
  };

  // "+" buttons on columns still queue real agent tasks (title + case type).
  const addTask = (col: string, title: string, caseType: string, agentDomain: string) => {
    const choice = AGENT_CHOICES.find((a) => a.domain === agentDomain) ?? AGENT_CHOICES[0];
    const registered = agents.find((a) => a.domain === choice.domain);
    const agentId = registered?.agent_id;
    // Queue a REAL task on the backend: the dispatcher claims it in ~2s, the
    // agent streams ledger events, and the card moves Queued -> Running ->
    // Completed/Review live over SSE. New cards always start queued; the
    // column the modal was opened from is just UI context.
    if (!agentId) {
      alert(
        `No "${choice.label}" registered on the backend yet. ` +
        `Queue one via POST /api/v1/agents (name=${choice.name}, domain=${choice.domain}), then try again.`
      );
      return;
    }
    void col;
    api
      .queueDecision({
        agent_id: agentId,
        case_id: title,
        case_type: caseType || "Market Entry Assessment",
        inputs: {
          client_name: title,
          research_question: caseType || title,
        },
      })
      .then(() => refresh())
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          alert("Agent not found on the backend - refresh and try again.");
        } else {
          alert("Could not queue this task on the backend. Is the API running?");
        }
      });
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-white p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-stone-900">
            Research Command Center
          </h1>
          <p className="mt-0.5 text-[12px] text-stone-500">
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${liveOn ? "bg-green-500" : "bg-stone-300"}`}
            />
            {liveOn ? "Live updates on" : "Connecting live feed (30s polling fallback)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunAgentOpen(true)}
            className="rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-stone-800 transition-colors hover:bg-stone-100"
          >
            Run agent
          </button>
          <button
            onClick={() => setModalCol("queued")}
            className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700"
          >
            Add Task
          </button>
        </div>
      </div>
      {/* Prompt bar: type a prompt, run a live agent, watch the card move. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("prompt") as HTMLInputElement | null)?.value ?? "";
          runPromptTask(input, AGENT_CHOICES[0].domain);
        }}
        className="mb-6 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/60 p-2 pl-4"
      >
        <input
          name="prompt"
          placeholder="Ask the research agent - e.g. Should Tata Power enter Rajasthan EV charging in FY27?"
          className="flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
        />
        <button
          type="submit"
          disabled={promptRunning}
          className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {promptRunning ? "Running..." : "Run"}
        </button>
      </form>
        {/* Board */}
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const cards = data.decisions.filter(
              (d) => d.status === col || (col === "review_required" && d.status === "disputed")
            );
            return (
              <section
                key={col}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col);
                }}
                onDragLeave={() => setDragOverCol((c) => (c === col ? null : c))}
                onDrop={() => onDrop(col)}
                className={`rounded-xl border border-stone-100 bg-stone-50/60 p-3 ${dragOverCol === col ? "drag-over" : ""}`}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold text-stone-700">
                    {COLUMN_LABELS[col]}
                    <span className="rounded bg-stone-200 px-1.5 text-[11px] font-medium text-stone-600">
                      {cards.length}
                    </span>
                  </h2>
                  <div className="flex items-center gap-1 text-stone-400">
                    <button
                      title="Add task to this column"
                      onClick={() => setModalCol(col)}
                      className="rounded px-1.5 hover:bg-stone-200 hover:text-stone-700"
                    >
                      +
                    </button>
                    <button
                      title="More options"
                      onClick={() => setModalCol(col)}
                      className="rounded px-1.5 hover:bg-stone-200 hover:text-stone-700"
                    >
                      ...
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {cards.map((card) => (
                    <div
                      key={card.task_id}
                      draggable
                      onDragStart={() => { setDragId(card.task_id); isDraggingRef.current = true; }}
                      onDragEnd={() => { setDragId(null); isDraggingRef.current = false; }}
                      className={dragId === card.task_id ? "dragging" : ""}
                    >
                      <TaskCard card={card} onStatusChange={applyStatus} onDelete={setDeleteTarget} />
                    </div>
                  ))}

                  <button
                    onClick={() => setModalCol(col)}
                    className="w-full rounded-lg border border-dashed border-stone-200 py-3.5 text-[13px] text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600"
                  >
                    Add Task
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </main>
      {modalCol && (
        <NewTaskModal col={modalCol} onClose={() => setModalCol(null)} onCreate={addTask} />
      )}
      {runAgentOpen && (
        <RunAgentModal
          running={promptRunning}
          onClose={() => setRunAgentOpen(false)}
          onRun={(prompt, agentDomain) => runPromptTask(prompt, agentDomain)}
        />
      )}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-base font-semibold tracking-tight text-stone-900">Delete task?</h2>
            <p className="mb-5 text-[13px] leading-relaxed text-stone-500">
              Delete &quot;{deleteTarget.case_id}&quot;? This removes the task and its events.
              Sealed records on the hash chain cannot be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-stone-200 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-md bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunAgentModal({
  running,
  onClose,
  onRun,
}: {
  running: boolean;
  onClose: () => void;
  onRun: (prompt: string, agentDomain: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [agentDomain, setAgentDomain] = useState(AGENT_CHOICES[0].domain);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold tracking-tight text-stone-900">
          Run agent <span className="font-normal text-stone-400">from a prompt</span>
        </h2>
        <p className="mb-4 text-[12px] leading-relaxed text-stone-500">
          Your prompt becomes the agent&apos;s research question. It runs live on the backend
          and the card moves Queued - Running - Completed/Review on this board.
        </p>
        <label className="mb-1 block text-xs font-medium text-stone-500">Prompt</label>
        <textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Should Tata Power enter Rajasthan EV charging in FY27?"
          className="mb-3 w-full resize-none rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
        />
        <label className="mb-1 block text-xs font-medium text-stone-500">Agent</label>
        <select
          value={agentDomain}
          onChange={(e) => setAgentDomain(e.target.value)}
          className="mb-5 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
        >
          {AGENT_CHOICES.map((a) => (
            <option key={a.domain} value={a.domain}>
              {a.label}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-stone-200 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            disabled={!prompt.trim() || running}
            onClick={() => onRun(prompt, agentDomain)}
            className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Running..." : "Run agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewTaskModal({
  col,
  onClose,
  onCreate,
}: {
  col: string;
  onClose: () => void;
  onCreate: (col: string, title: string, caseType: string, agentDomain: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState("");
  const [agentDomain, setAgentDomain] = useState(AGENT_CHOICES[0].domain);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold tracking-tight text-stone-900">
          New live task <span className="font-normal text-stone-400">runs a real agent</span>
        </h2>
        <p className="mb-4 text-[12px] leading-relaxed text-stone-500">
          Queued on the backend now, claimed by the dispatcher in ~2s, card moves live.
        </p>
        <label className="mb-1 block text-xs font-medium text-stone-500">Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Vendor Due Diligence - Acme Corp"
          className="mb-3 w-full rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
        />
        <label className="mb-1 block text-xs font-medium text-stone-500">Case type</label>
        <input
          value={caseType}
          onChange={(e) => setCaseType(e.target.value)}
          placeholder="e.g. Due Diligence"
          className="mb-3 w-full rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
        />
        <label className="mb-1 block text-xs font-medium text-stone-500">Agent</label>
        <select
          value={agentDomain}
          onChange={(e) => setAgentDomain(e.target.value)}
          className="mb-5 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
        >
          {AGENT_CHOICES.map((a) => (
            <option key={a.domain} value={a.domain}>
              {a.label}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-stone-200 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            disabled={!title.trim()}
            onClick={() => {
              onCreate(col, title.trim(), caseType.trim(), agentDomain);
              onClose();
            }}
            className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Queue live task
          </button>
        </div>
      </div>
    </div>
  );
}
