"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, AgentOut, DecisionListResponse, TaskSummary } from "@/lib/api";
import TaskCard from "@/components/TaskCard";
import { STATUS, lookup, toneColor } from "@/lib/vocab";
import StreamProgress from "@/components/StreamProgress";

const COLUMNS = ["queued", "running", "review_required", "completed"] as const;
/** Lanes a card can only enter by being sealed — never by a manual status move. */
const TERMINAL_STATUSES = new Set<string>(["completed", "review_required"]);
const COLUMN_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  review_required: "Review Ready",
  completed: "Completed",
};
/** One line under each lane heading, so the board explains its own workflow. */
const COLUMN_PURPOSE: Record<string, string> = {
  queued: "Waiting for an agent",
  running: "Agent is working",
  review_required: "Sealed · needs a person",
  completed: "Sealed · done",
};

const AGENT_CHOICES = [
  { label: "Research Agent", name: "ResearchAgent", domain: "deloitte_client_research" },
  { label: "Compliance Bot", name: "ComplianceBot", domain: "regulatory_compliance" },
];

const EMPTY: DecisionListResponse = { total: 0, decisions: [] };

function Pill({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-transparent pl-3.5 pr-4 text-[13.5px] font-medium whitespace-nowrap text-text-2 hover:border-[#cdc8be] hover:bg-hover hover:text-text-2 max-md:shrink-0"
    >
      {icon}
      {children}
    </button>
  );
}

function PillIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DecisionListResponse>(EMPTY);
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [modalCol, setModalCol] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskSummary | null>(null);
  // Streaming research state
  const [streamOpen, setStreamOpen] = useState(false);
  const [streamTokens, setStreamTokens] = useState("");
  const [streamStatus, setStreamStatus] = useState<string>("");
  const [streamTaskId, setStreamTaskId] = useState<string | null>(null);
  const [streamCaseId, setStreamCaseId] = useState<string | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  const [streamMinimized, setStreamMinimized] = useState(false);
  const [streamShowRaw, setStreamShowRaw] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [promptRunning, setPromptRunning] = useState(false);
  // Board filters (client-side only)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterHighRisk, setFilterHighRisk] = useState(false);
  const [filterReview, setFilterReview] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLInputElement | null>(null);

  const isDraggingRef = useRef(false);

  const refresh = useCallback(() => {
    if (isDraggingRef.current) return;
    api.listDecisions().then((res) => {
      if (!isDraggingRef.current) setData(res);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    api.listAgents().then((res) => setAgents(res.agents)).catch(() => {});
    const timer = setInterval(refresh, 10000);
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");
    let es: EventSource | null = null;
    try {
      // EventSource cannot set headers; the backend accepts ?key= on the SSE
      // route for exactly this reason.
      const sseKey = process.env.NEXT_PUBLIC_TRUSTLEDGER_API_KEY ?? "";
      const sseUrl = `${base}/api/v1/decisions/stream${sseKey ? `?key=${encodeURIComponent(sseKey)}` : ""}`;
      es = new EventSource(sseUrl);
      es.onopen = () => {};
      es.onerror = () => {};
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

  const runStreamingResearch = (prompt: string, agentDomain: string) => {
    const text = prompt.trim();
    if (!text) return;
    setPromptRunning(true);
    setStreamOpen(true);
    setStreamMinimized(false);
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
        case_id: "", // backend generates the RES-YYYY-###### code
        case_type: caseType || "Market Entry Assessment",
        inputs: { research_question: title },
      })
      .then(() => refresh())
      .catch(() => {
        runStreamingResearch(title, choice.domain);
      });
  };

  const q = searchQuery.trim().toLowerCase();
  const filtered = data.decisions.filter((d) => {
    if (q) {
      const hay = `${d.case_id} ${d.case_type} ${d.agent_name} ${d.outcome_summary ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterHighRisk && d.risk_level !== "high") return false;
    if (filterReview && d.status !== "review_required" && d.status !== "disputed") return false;
    return true;
  });
  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-text max-md:pb-14">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: logo + quick actions + research prompt */}
        <header className="flex shrink-0 flex-wrap items-center gap-2.5 bg-transparent pt-4 pr-5 pb-3 pl-5 max-md:gap-2 max-md:px-3 max-md:pt-1">
          <a
            href="/"
            title="TrustLedger"
            className="mr-1 flex flex-1 items-center gap-3 no-underline max-md:hidden"
          >
            <span className="flex size-10 shrink-0 items-center justify-center text-text">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="6" y="6" width="20" height="20" rx="5.5" />
                <rect x="6" y="15.5" width="20" height="2.5" rx="1.25" fill="currentColor" stroke="none" />
                <path d="M11.5 10.5h3.5M11.5 21.5h7" />
              </svg>
            </span>
            <span className="text-[17px] font-semibold tracking-[-.3px] text-text">TrustLedger</span>
          </a>
          <div className="flex flex-wrap items-center gap-[9px]">
            <Pill
              onClick={() => setModalCol("queued")}
              icon={
                <PillIcon>
                  <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
                  <path d="M7 10h6M10 7v6" />
                </PillIcon>
              }
            >
              Add Task
            </Pill>
            <Pill
              onClick={() => promptRef.current?.focus()}
              icon={
                <PillIcon>
                  <path d="M13.6 3.4l3 3L10 13H7v-3z" />
                  <path d="M11 4H5.6A1.6 1.6 0 0 0 4 5.6v8.8A1.6 1.6 0 0 0 5.6 16h8.8A1.6 1.6 0 0 0 16 14.4V9" />
                </PillIcon>
              }
            >
              Ask Research
            </Pill>
            <Pill
              onClick={() => refresh()}
              icon={
                <PillIcon>
                  <path d="M16 10a6 6 0 1 1-2-4.2" />
                  <path d="M14 2.5v3.5h-3.5" />
                </PillIcon>
              }
            >
              Refresh
            </Pill>
          </div>
          <div className="relative flex flex-1 items-center justify-end gap-2 max-md:w-full">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runStreamingResearch(promptInput, AGENT_CHOICES[0].domain);
              }}
              className="relative flex items-center"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                width="16"
                height="16"
                className="pointer-events-none absolute left-[15px] stroke-muted-2"
              >
                <path d="M9.5 3.5c1.2 0 2.3.4 3.1 1l3.5 3.5-7.4 7.4-3.4.9.9-3.4 6-6z" />
                <path d="M12.4 6.3l2.9 2.9" />
              </svg>
              <input
                ref={promptRef}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Ask a research question…"
                className="h-10 w-[min(300px,24vw)] min-w-0 rounded-full border border-border bg-surface px-2.5 py-1 pr-[64px] pl-10 text-[13.5px] text-text outline-none placeholder:text-muted max-md:w-full"
              />
              <button
                type="submit"
                disabled={promptRunning || !promptInput.trim()}
                className="absolute right-1.5 h-8 cursor-pointer rounded-full border-none bg-ink px-4 text-[12.5px] font-semibold text-ink-fg disabled:opacity-40"
              >
                {promptRunning ? "…" : "Run"}
              </button>
            </form>
            <button
              type="button"
              title="Filters"
              aria-pressed={filterHighRisk || filterReview}
              onClick={() => setFilterOpen((v) => !v)}
              className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] ${
                filterHighRisk || filterReview ? "bg-ink text-ink-fg" : "text-text-2 hover:bg-hover"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h12l-4.5 5v4l-3 1.8v-5.8z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Board toolbar: counts */}
        <div className="flex shrink-0 items-center gap-3.5 border-b border-border px-6 py-3 max-md:px-3">
          <div className="flex-1" />
          <span className="font-mono text-xs text-muted-2">{filtered.length} shown</span>
        </div>

        {/* Streaming live viewer — floating modal window, minimizable */}
        {streamOpen && !streamMinimized && (
          <div className="fixed right-5 bottom-5 z-40 flex max-h-[420px] w-[440px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-pop max-md:bottom-20">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${promptRunning ? "animate-pulse bg-ink" : streamDone ? "bg-ink" : "bg-faint"}`}
                />
                <span className="truncate font-medium text-text-2">{streamStatus || "Waiting…"}</span>
                {streamCaseId && <span className="hidden truncate text-muted sm:inline">· {streamCaseId}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {streamTaskId && (
                  <a
                    href={`/decisions/${streamTaskId}`}
                    className="rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-ink-fg no-underline hover:brightness-96"
                  >
                    Open record
                  </a>
                )}
                <button
                  type="button"
                  title="Minimize"
                  onClick={() => setStreamMinimized(true)}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[15px] leading-none text-muted-2 hover:bg-hover hover:text-text-2"
                >
                  —
                </button>
                <button
                  type="button"
                  title="Close"
                  onClick={() => {
                    setStreamOpen(false);
                    setStreamTokens("");
                  }}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[15px] leading-none text-faint hover:bg-hover hover:text-text"
                >
                  ×
                </button>
              </div>
            </div>
            <div ref={streamRef} className="min-h-0 flex-1 overflow-auto px-4 py-3">
              <StreamProgress raw={streamTokens} running={promptRunning} showRaw={streamShowRaw} />
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface-2 px-4 py-2 text-[11px] text-muted-2">
              {streamTokens.length ? (
                <button
                  type="button"
                  onClick={() => setStreamShowRaw((v) => !v)}
                  className="cursor-pointer border-none bg-transparent p-0 text-[11px] text-muted-2 underline underline-offset-2 hover:text-text-2"
                >
                  {streamShowRaw ? "Show progress" : `Show raw output · ${streamTokens.length} chars`}
                </button>
              ) : (
                <span>The audit record is written as the agent works</span>
              )}
              {streamDone && streamTaskId && <span className="font-medium text-ink">Sealed + hash-chained ✓</span>}
            </div>
          </div>
        )}
        {streamOpen && streamMinimized && (
          <div className="fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pr-1.5 pl-4 shadow-pop max-md:bottom-20">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${promptRunning ? "animate-pulse bg-ink" : streamDone ? "bg-ink" : "bg-faint"}`}
            />
            <span className="max-w-[220px] truncate text-xs font-medium text-text-2">{streamStatus || "Waiting…"}</span>
            {streamDone && streamTaskId && <span className="text-[11px] font-medium text-ink">Sealed ✓</span>}
            <button
              type="button"
              title="Restore"
              onClick={() => setStreamMinimized(false)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-ink text-[11px] text-ink-fg hover:brightness-96"
            >
              ▲
            </button>
            <button
              type="button"
              title="Close"
              onClick={() => {
                setStreamOpen(false);
                setStreamTokens("");
              }}
              className="flex size-6 cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[15px] leading-none text-faint hover:text-text"
            >
              ×
            </button>
          </div>
        )}

        {/* Kanban board */}
        <main className="flex-1 overflow-x-auto overflow-y-hidden pt-[18px] pr-6 pb-[22px] pl-1.5 max-md:px-3">
          <div className="flex h-full w-full min-w-min gap-0">
            {COLUMNS.map((col) => {
              const cards = filtered.filter(
                (d) => d.status === col || (col === "review_required" && d.status === "disputed"),
              );
              const highlight = dragOverCol === col;
              return (
                <div
                  key={col}
                  id={`col-${col}`}
                  onDragOver={(e) => {
                    // Terminal lanes are reachable only via a sealed decision
                    // record, so refuse the drop instead of bouncing it back.
                    if (TERMINAL_STATUSES.has(col)) return;
                    e.preventDefault();
                    setDragOverCol(col);
                  }}
                  onDragLeave={() => setDragOverCol((c) => (c === col ? null : c))}
                  onDrop={() => {
                    if (TERMINAL_STATUSES.has(col)) return;
                    onDrop(col);
                  }}
                  className="flex h-full w-[262px] min-w-[262px] flex-1 flex-col rounded-[14px] px-1.5 pt-3 pb-1 transition-[background,border-color] duration-[120ms] max-md:w-[86vw] max-md:snap-start"
                  style={{
                    background: "transparent",
                    border: `1px solid ${highlight ? "var(--muted-2)" : "transparent"}`,
                  }}
                >
                  <div className="flex items-center gap-2 px-1.5 pt-0.5 pb-3">
                    <span className="size-[9px] shrink-0 rounded-full" style={{ background: toneColor(lookup(STATUS, col)?.tone ?? "neutral") }} />
                    <span className="text-[13px] font-semibold tracking-[.3px] text-text-2 uppercase">
                      {COLUMN_LABELS[col]}
                    </span>
                    <span className="font-mono text-[11.5px] text-muted-2">{cards.length}</span>
                    <span className="truncate text-[11.5px] font-normal normal-case text-muted">{COLUMN_PURPOSE[col]}</span>
                    <button
                      type="button"
                      title="Add to stage"
                      onClick={() => setModalCol(col)}
                      className="ml-auto flex size-6 cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[17px] leading-none text-muted-2 hover:bg-hover hover:text-text-2"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-[9px] overflow-x-hidden overflow-y-auto px-1 pt-0.5 pb-2">
                    {cards.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border px-2 py-[22px] text-center text-xs text-[#bdb9b1]">
                        No tasks here
                      </div>
                    )}
                    {cards.map((card) => (
                      <div
                        key={card.task_id}
                        draggable={!card.sealed}
                        onDragStart={() => {
                          if (card.sealed) return;
                          setDragId(card.task_id);
                          isDraggingRef.current = true;
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          isDraggingRef.current = false;
                        }}
                        className={`transition-transform ${dragId === card.task_id ? "scale-[0.98] opacity-60" : ""}`}
                      >
                        <TaskCard card={card} onStatusChange={applyStatus} onDelete={setDeleteTarget} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav (mirrors the reference shell) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-border bg-surface max-md:flex">
        <a href="/command-center" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-text">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4" />
            <path d="M7.5 9h9M7.5 12h9M7.5 15h5" />
          </svg>
          <span className="text-[10px] font-medium">Board</span>
        </a>
        <button
          type="button"
          onClick={() => promptRef.current?.focus()}
          className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 border-none bg-transparent py-2 text-text-2"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.6 3.4l3 3L10 13H7v-3z" />
            <path d="M11 4H5.6A1.6 1.6 0 0 0 4 5.6v8.8A1.6 1.6 0 0 0 5.6 16h8.8A1.6 1.6 0 0 0 16 14.4V9" />
          </svg>
          <span className="text-[10px] font-medium">Ask</span>
        </button>
        <button
          type="button"
          onClick={() => refresh()}
          className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 border-none bg-transparent py-2 text-text-2"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 10a6 6 0 1 1-2-4.2" />
            <path d="M14 2.5v3.5h-3.5" />
          </svg>
          <span className="text-[10px] font-medium">Refresh</span>
        </button>
      </nav>

      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,27,26,0.3)] p-4" onClick={() => setFilterOpen(false)}>
          <div
            className="w-full max-w-xs rounded-[14px] border border-border bg-surface p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mb-3 flex items-center">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                width="14"
                height="14"
                className="pointer-events-none absolute left-[11px] stroke-muted-2"
              >
                <circle cx="8.5" cy="8.5" r="5" />
                <path d="M12.5 12.5 17 17" />
              </svg>
              <input
                placeholder="Filter this board…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-[9px] border border-border bg-surface py-[7px] pr-[11px] pl-8 text-[13px] text-text outline-none placeholder:text-muted"
              />
            </div>
            <h2 className="mb-3 text-base font-semibold text-text">Filters</h2>
            {[
              { label: "High risk", on: filterHighRisk, toggle: () => setFilterHighRisk((v) => !v) },
              { label: "Review required", on: filterReview, toggle: () => setFilterReview((v) => !v) },
            ].map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={f.toggle}
                className="flex w-full cursor-pointer items-center justify-between rounded-[9px] px-3 py-2 hover:bg-hover"
              >
                <span className="text-[13.5px] font-medium text-text">{f.label}</span>
                <span
                  className={`flex size-[18px] items-center justify-center rounded-[5px] border text-[11px] font-bold ${
                    f.on ? "border-ink bg-ink text-ink-fg" : "border-muted-2 bg-transparent"
                  }`}
                >
                  {f.on ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {modalCol && <NewTaskModal col={modalCol} onClose={() => setModalCol(null)} onCreate={addTask} />}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,27,26,0.3)] p-4" onClick={() => setDeleteTarget(null)}>
          <div
            className="w-full max-w-sm rounded-[14px] border border-border bg-surface p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-base font-semibold text-text">Delete task?</h2>
            <p className="mb-5 text-[13px] text-text-2">Delete &quot;{deleteTarget.case_id}&quot;? Sealed records cannot be deleted.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="cursor-pointer rounded-full border border-border px-4 py-1.5 text-[13px] font-medium text-text-2 hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-ink-fg hover:brightness-96"
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
  onCreate: (col: string, title: string, caseType: string, agentDomain: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState("");
  const [agentDomain, setAgentDomain] = useState(AGENT_CHOICES[0].domain);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,27,26,0.3)] p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-[14px] border border-border bg-surface p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold text-text">
          New live task <span className="font-normal text-muted">streams</span>
        </h2>
        <p className="mb-4 text-[12px] text-muted">Creates a live research run. Watch tokens stream above.</p>
        <label className="mb-1 block text-xs font-medium text-text-2">Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Vendor Due Diligence — Acme Corp"
          className="mb-3 w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-muted-2"
        />
        <label className="mb-1 block text-xs font-medium text-text-2">Case type</label>
        <input
          value={caseType}
          onChange={(e) => setCaseType(e.target.value)}
          placeholder="e.g. Due Diligence"
          className="mb-3 w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-muted-2"
        />
        <label className="mb-1 block text-xs font-medium text-text-2">Agent</label>
        <select
          value={agentDomain}
          onChange={(e) => setAgentDomain(e.target.value)}
          className="mb-5 w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-muted-2"
        >
          {AGENT_CHOICES.map((a) => (
            <option key={a.domain} value={a.domain}>
              {a.label}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full border border-border px-4 py-1.5 text-[13px] font-medium text-text-2 hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!title.trim()}
            onClick={() => {
              onCreate(col, title.trim(), caseType.trim(), agentDomain);
              onClose();
            }}
            className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-ink-fg hover:brightness-96 disabled:opacity-40"
          >
            Queue live task
          </button>
        </div>
      </div>
    </div>
  );
}
