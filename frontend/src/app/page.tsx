"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, DecisionListResponse, TaskSummary } from "@/lib/api";
import TaskCard from "@/components/TaskCard";
import Sidebar from "@/components/Sidebar";

const COLUMNS = ["queued", "running", "review_required", "completed"] as const;
const COLUMN_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  review_required: "Review Ready",
  completed: "Completed",
};

/* Demo data so the design renders even when the backend is offline */
const DEMO: DecisionListResponse = {
  total: 8,
  decisions: [
    { task_id: "t-1041", case_id: "Vendor Due Diligence - Acme Corp", case_type: "Clients", agent_name: "Scout Agent", status: "queued", risk_level: null, outcome: null, outcome_summary: "Engagement queued for research agent run; waiting in the processing pipeline.", duration_seconds: null, human_review_status: null, created_at: "2026-08-20T10:00:00Z" },
    { task_id: "t-1042", case_id: "Sanctions Screening Refresh", case_type: "Compliance", agent_name: "Compliance Bot", status: "queued", risk_level: null, outcome: null, outcome_summary: "Periodic re-screen of the counterparty watchlist with fresh list data.", duration_seconds: null, human_review_status: null, created_at: "2026-08-21T10:00:00Z" },
    { task_id: "t-1037", case_id: "Review Mobile App Redesign", case_type: "Offices work", agent_name: "Research Agent Alpha", status: "running", risk_level: null, outcome: null, outcome_summary: "Agent is evaluating and refining the updated design of a mobile application across key flows.", duration_seconds: 320, human_review_status: null, created_at: "2026-08-18T09:30:00Z" },
    { task_id: "t-1038", case_id: "Check User Flow Health App", case_type: "Personal", agent_name: "Flow Analyzer", status: "running", risk_level: null, outcome: null, outcome_summary: "Analyzing the sequence of steps users take within the health app onboarding funnel.", duration_seconds: 480, human_review_status: null, created_at: "2026-08-17T14:00:00Z" },
    { task_id: "t-1029", case_id: "Research Best Practices", case_type: "Personal", agent_name: "Policy Scout", status: "review_required", risk_level: "medium", outcome: "escalated", outcome_summary: "Flagged for human review - recommendation conflicts with an existing policy reference.", duration_seconds: 95, human_review_status: "pending", created_at: "2026-08-12T11:00:00Z" },
    { task_id: "t-1031", case_id: "Develop UI Concepts Agency", case_type: "Clients", agent_name: "Design Agent", status: "review_required", risk_level: "low", outcome: "approved_with_notes", outcome_summary: "User-centered interface concepts tailored specifically to the client brand system.", duration_seconds: 210, human_review_status: "pending", created_at: "2026-08-13T11:00:00Z" },
    { task_id: "t-1020", case_id: "Design Skill Tree Visualization", case_type: "Project", agent_name: "Vision Agent", status: "completed", risk_level: "low", outcome: "approved", outcome_summary: "Structured visualization generated and sealed to the tamper-evident audit chain.", duration_seconds: 145, human_review_status: "approved", created_at: "2026-08-05T10:00:00Z" },
    { task_id: "t-1023", case_id: "Create Wireframe Website", case_type: "Project", agent_name: "Wireframe Bot", status: "completed", risk_level: "low", outcome: "approved", outcome_summary: "Foundational wireframe layout produced, replayable end-to-end with evidence.", duration_seconds: 189, human_review_status: "approved", created_at: "2026-08-06T10:00:00Z" },
  ] as TaskSummary[],
};


export default function DashboardPage() {
  const [data, setData] = useState<DecisionListResponse>(DEMO);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<TaskSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  const onDrop = (col: string) => {
    if (!dragId) return;
    const taskId = dragId;
    // Capture previous status BEFORE the optimistic update
    const previous = data.decisions.find((d) => d.task_id === taskId)?.status;
    // If the card is dropped on its current column, no-op
    if (previous === col) {
      setDragId(null);
      setDragOverCol(null);
      isDraggingRef.current = false;
      return;
    }
    // Optimistic local move
    setData((prev) => ({
      ...prev,
      decisions: prev.decisions.map((d) =>
        d.task_id === taskId ? { ...d, status: col } : d
      ),
    }));
    setDragId(null);
    setDragOverCol(null);
    isDraggingRef.current = false;
    // Persist to backend so the next refresh keeps the card in its new column
    api
      .updateDecisionStatus(taskId, col)
      .catch((err: unknown) => {
        // Always revert on failure — don't gate on previous truthiness
        const revertStatus = previous ?? col;
        setData((prev) => ({
          ...prev,
          decisions: prev.decisions.map((d) =>
            d.task_id === taskId ? { ...d, status: revertStatus } : d
          ),
        }));
        // Show user-visible feedback for sealed-record rejection
        if (err instanceof ApiError && err.status === 409) {
          alert(`Cannot move "${taskId}": this record is sealed to the audit chain.`);
        }
      });
  };

  const confirmDelete = async () => {
    if (!deleteCandidate || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteDecision(deleteCandidate.task_id);
      setData((previous) => ({
        decisions: previous.decisions.filter((card) => card.task_id !== deleteCandidate.task_id),
        total: Math.max(0, previous.total - 1),
      }));
      setDeleteCandidate(null);
    } catch (err: unknown) {
      setDeleteError(
        err instanceof ApiError && err.status === 409 && err.code === "TASK_SEALED"
          ? "This task has been sealed on the hash chain and cannot be deleted."
          : "Unable to delete this task. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-white p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight text-stone-900">
          Research Command Center
        </h1>
        <button className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700">
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
                    <button className="rounded px-1.5 hover:bg-stone-200 hover:text-stone-700">+</button>
                    <button className="rounded px-1.5 hover:bg-stone-200 hover:text-stone-700">...</button>
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
                      <TaskCard card={card} onDelete={(selected) => { setDeleteError(null); setDeleteCandidate(selected); }} />
                    </div>
                  ))}

                  <button className="w-full rounded-lg border border-dashed border-stone-200 py-3.5 text-[13px] text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600">
                    Add Task
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </main>
      {deleteCandidate && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/30 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 id="delete-task-title" className="text-lg font-semibold text-stone-900">Delete task?</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Delete <span className="font-medium text-stone-800">{deleteCandidate.case_id}</span>? This cannot be undone.
            </p>
            {deleteError && <p role="alert" className="mt-3 text-sm text-red-600">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => { setDeleteCandidate(null); setDeleteError(null); }}
                className="rounded-md border border-stone-300 px-3.5 py-2 text-sm font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
