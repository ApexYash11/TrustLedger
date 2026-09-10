"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, DecisionListResponse, TaskSummary } from "@/lib/api";
import { DEMO_CARDS } from "@/lib/demoData";
import TaskCard from "@/components/TaskCard";
import Sidebar from "@/components/Sidebar";

const COLUMNS = ["queued", "running", "review_required", "completed"] as const;
const COLUMN_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  review_required: "Review Ready",
  completed: "Completed",
};

const DEMO: DecisionListResponse = {
  total: DEMO_CARDS.length,
  decisions: DEMO_CARDS,
};


export default function DashboardPage() {
  const [data, setData] = useState<DecisionListResponse>(DEMO);
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
        if (!isDraggingRef.current)
          // Static preview cards are kept alongside live data so the board
          // layout can be evaluated as it will look with a full agent run.
          setData({ total: res.total + DEMO.decisions.length, decisions: [...DEMO.decisions, ...res.decisions] });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
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
    // Local-only demo cards vanish immediately; nothing to delete server-side.
    if (taskId.startsWith("local-") || taskId.startsWith("demo-")) {
      setData((prev) => ({
        total: prev.total - 1,
        decisions: prev.decisions.filter((d) => d.task_id !== taskId),
      }));
      setDeleteTarget(null);
      return;
    }
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

  const addTask = (col: string, title: string, caseType: string) => {
    const newCard: TaskSummary = {
      task_id: `local-${Date.now()}`,
      case_id: title,
      case_type: caseType || "Research",
      agent_name: "Unassigned",
      status: col,
      risk_level: null,
      outcome: null,
      outcome_summary: null,
      duration_seconds: null,
      human_review_status: null,
      created_at: new Date().toISOString(),
    };
    setData((prev) => ({
      total: prev.total + 1,
      decisions: [newCard, ...prev.decisions],
    }));
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
        <button
          onClick={() => setModalCol("queued")}
          className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700"
        >
          Add Task
        </button>
      </div>
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

function NewTaskModal({
  col,
  onClose,
  onCreate,
}: {
  col: string;
  onClose: () => void;
  onCreate: (col: string, title: string, caseType: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold tracking-tight text-stone-900">
          New Task <span className="font-normal text-stone-400">in {COLUMN_LABELS[col]}</span>
        </h2>
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
          className="mb-5 w-full rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
        />
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
              onCreate(col, title.trim(), caseType.trim());
              onClose();
            }}
            className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
