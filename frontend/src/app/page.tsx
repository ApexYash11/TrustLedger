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

/* Preview data: static cards shown alongside live data so the board layout
   can be evaluated as it will look with a full live agent run. */
const DEMO: DecisionListResponse = {
  total: 12,
  decisions: [
    { task_id: "demo-1041", case_id: "Vendor Due Diligence - Acme Corp", case_type: "Due Diligence", agent_name: "Scout Agent", status: "queued", risk_level: "medium", outcome: null, outcome_summary: "Financials, litigation history and beneficial ownership checks queued for the research pipeline.", duration_seconds: null, human_review_status: null, created_at: "2026-08-28T10:00:00Z" },
    { task_id: "demo-1042", case_id: "Sanctions Screening Refresh", case_type: "Compliance", agent_name: "Compliance Bot", status: "queued", risk_level: "low", outcome: null, outcome_summary: "Periodic re-screen of the counterparty against updated OFAC, EU and UN watchlists.", duration_seconds: null, human_review_status: null, created_at: "2026-08-28T09:15:00Z" },
    { task_id: "demo-1037", case_id: "Market Entry Study - Quick Commerce", case_type: "Market Entry", agent_name: "Research Agent Alpha", status: "running", risk_level: "high", outcome: null, outcome_summary: "Agent is mapping competitor dark-store density and delivery-fee economics across tier-1 cities.", duration_seconds: 320, human_review_status: null, created_at: "2026-08-27T09:30:00Z" },
    { task_id: "demo-1038", case_id: "Regulatory Scan - Lending Norms", case_type: "Regulatory", agent_name: "Policy Scout", status: "running", risk_level: "medium", outcome: null, outcome_summary: "Tracking RBI circulars on unsecured lending and their impact on the proposed credit line.", duration_seconds: 480, human_review_status: null, created_at: "2026-08-27T08:10:00Z" },
    { task_id: "demo-1029", case_id: "Cyber Risk Assessment - Insurance", case_type: "Risk Assessment", agent_name: "Risk Agent", status: "review_required", risk_level: "high", outcome: "escalated", outcome_summary: "Escalated: conflicting findings on third-party API exposure; routed for partner review.", duration_seconds: 95, human_review_status: "pending", created_at: "2026-08-27T11:00:00Z" },
    { task_id: "demo-1031", case_id: "ESG Disclosure Readiness - Cement", case_type: "ESG", agent_name: "Compliance Bot", status: "review_required", risk_level: "medium", outcome: "approved_with_notes", outcome_summary: "BRSR disclosures achievable with proposed emissions data; two gaps flagged for notes.", duration_seconds: 210, human_review_status: "pending", created_at: "2026-08-27T10:20:00Z" },
    { task_id: "demo-1026", case_id: "Market Entry Assessment - EV Charging", case_type: "Market Entry", agent_name: "Scout Agent", status: "review_required", risk_level: "high", outcome: "conditional", outcome_summary: "Conditional recommendation: enter via a phased pilot in the Jaipur-Udaipur corridor.", duration_seconds: 400, human_review_status: "pending", created_at: "2026-08-25T14:45:00Z" },
    { task_id: "demo-1020", case_id: "Pricing Analysis - Quick Commerce", case_type: "Pricing", agent_name: "Vision Agent", status: "completed", risk_level: "low", outcome: "approved", outcome_summary: "Recommended: 6-minute delivery fee of ₹19 maximizes retention without breaching the ₹24 cost floor.", duration_seconds: 145, human_review_status: "approved", created_at: "2026-08-27T10:00:00Z" },
    { task_id: "demo-1023", case_id: "ESG Disclosure Readiness - Cement", case_type: "ESG", agent_name: "Wireframe Bot", status: "completed", risk_level: "medium", outcome: "approved", outcome_summary: "Recommended: FY27 BRSR disclosures are achievable with the proposed emissions data model.", duration_seconds: 189, human_review_status: "approved", created_at: "2026-08-27T09:00:00Z" },
    { task_id: "demo-1017", case_id: "Cost Optimization Study - Manufacturing", case_type: "Cost Analysis", agent_name: "Research Agent Alpha", status: "completed", risk_level: "low", outcome: "approved", outcome_summary: "Recommended: adopt the two-shift layout; validated ₹3.4 crore annual saving with no capex.", duration_seconds: 160, human_review_status: "approved", created_at: "2026-08-27T08:30:00Z" },
    { task_id: "demo-1013", case_id: "Regulatory Scan - Data Privacy", case_type: "Regulatory", agent_name: "Policy Scout", status: "completed", risk_level: "medium", outcome: "rejected", outcome_summary: "Not recommended: launch the wallet feature only after DPDP compliance sign-off on the consent flow.", duration_seconds: 230, human_review_status: "approved", created_at: "2026-08-26T16:00:00Z" },
    { task_id: "demo-1011", case_id: "M&A Screening - Logistics Target", case_type: "M&A Screening", agent_name: "Scout Agent", status: "completed", risk_level: "high", outcome: "escalated", outcome_summary: "Escalated: target's pending tax litigation materially changes the valuation band; partner sign-off needed.", duration_seconds: 310, human_review_status: "approved", created_at: "2026-08-25T12:00:00Z" },
  ] as TaskSummary[],
};


export default function DashboardPage() {
  const [data, setData] = useState<DecisionListResponse>(DEMO);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [modalCol, setModalCol] = useState<string | null>(null);

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
        <h1 className="text-[22px] font-bold tracking-tight text-stone-900">
          Research Command Center
        </h1>
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
                      <TaskCard card={card} />
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
