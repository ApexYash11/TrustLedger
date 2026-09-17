"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DecisionGraph from "@/components/DecisionGraph";
import DecisionTimeline from "@/components/DecisionTimeline";
import IntegrityPanel from "@/components/IntegrityPanel";
import ReplayViewer from "@/components/ReplayViewer";
import Chip, { RiskIcon } from "@/components/Chip";
import { api, ApiError, API_URL, FullDecisionRecord } from "@/lib/api";
import { formatTimestamp, humanize } from "@/lib/format";
import { OUTCOME, REVIEW, RISK, STATUS, TAB_PURPOSE, lookup, toneColor } from "@/lib/vocab";

const clean = (s: string) => s.replace(/—/g, "-").replace(/–/g, "-");
const API_BASE = API_URL;


const TABS = ["Summary", "Decision Trail", "Replay", "Integrity"] as const;
type Tab = (typeof TABS)[number];
type TaskData = { task_id?: string; case_id?: string; case_type?: string; status?: string; risk_level?: string | null; human_review_status?: string | null; inputs?: Record<string, unknown>; created_at?: string; completed_at?: string | null; };
type DecisionData = { outcome?: string; outcome_summary?: string; structured_rationale?: { primary_reason?: string; supporting_factors?: string[]; policy_basis?: string[]; evidence_basis?: string[]; exclusions_applied?: string[] }; confidence_score?: number | null; decided_at?: string; };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-5 shadow-card">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Summary({ record }: { record: FullDecisionRecord }) {
  const task = record.task as TaskData;
  const decision = record.decision as DecisionData | null;
  const outcomeEntry = lookup(OUTCOME, decision?.outcome);
  const conf = decision?.confidence_score != null ? Math.round(decision.confidence_score * 100) : null;

  return (
    <div className="space-y-4">
      {/* Hero outcome */}
      <div className="overflow-hidden rounded-[14px] bg-ink text-ink-fg shadow-card">
        <div className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[rgba(245,243,240,.5)]">Recommendation</p>
          {decision ? (
            <>
              <div className="mt-2 flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
                  style={{ background: outcomeEntry ? toneColor(outcomeEntry.tone) : "#fff", color: "#fff" }}
                >
                  {outcomeEntry?.icon ?? "•"}
                </span>
                <div>
                  <h3 className="text-xl font-semibold leading-tight">
                    {outcomeEntry?.label ?? humanize(decision.outcome)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[rgba(245,243,240,.75)]">{decision.outcome_summary}</p>
                  {outcomeEntry && (
                    <p className="mt-1.5 text-[12.5px] text-[rgba(245,243,240,.5)]">{outcomeEntry.meaning}</p>
                  )}
                </div>
              </div>
              {decision.structured_rationale?.primary_reason && (
                <div className="mt-4 rounded-lg bg-white/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[rgba(245,243,240,.5)]">Why — in one sentence</p>
                  <p className="mt-1 text-sm leading-relaxed">{decision.structured_rationale.primary_reason}</p>
                </div>
              )}
              {conf != null && (
                <div className="mt-4 flex items-center gap-3 text-xs text-[rgba(245,243,240,.6)]">
                  <span>Confidence</span>
                  <div className="h-1.5 flex-1 max-w-[160px] rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white" style={{ width: `${conf}%` }} />
                  </div>
                  <span className="font-medium text-ink-fg">{conf}%</span>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-[rgba(245,243,240,.75)]">No decision yet — this task is still {humanize(task.status)}.</p>
          )}
        </div>
        <div className="flex gap-2 border-t border-white/10 bg-white/[0.04] px-6 py-3 text-xs">
          <span className="text-[rgba(245,243,240,.5)]">Human review</span>
          <span className="font-medium text-ink-fg">{humanize(task.human_review_status)}</span>
          <span className="mx-2 text-[rgba(245,243,240,.4)]">·</span>
          <span className="text-[rgba(245,243,240,.5)]">Decided</span>
          <span className="font-medium text-ink-fg">{decision?.decided_at ? formatTimestamp(decision.decided_at) : "—"}</span>
        </div>
      </div>

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
                <div key={k} className="flex gap-3">
                  <dt className="w-36 shrink-0 text-muted">{k}</dt>
                  <dd className="font-medium text-text break-words">{v}</dd>
                </div>
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
              <li key={i} className="flex gap-2">
                <span className="text-muted">—</span>
                <span className="text-text-2">{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DecisionGraph record={record} />

      {/* The graph shows how the facts relate; SVG can only fit truncated
          titles, so the full text lives here directly beneath it. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title={`Sources · ${record.evidence.length}`}>
          {record.evidence.length ? (
            <ul className="mt-3 space-y-2.5 text-sm">
              {record.evidence.map((it) => (
                <li
                  key={it.evidence_id}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2.5"
                  style={{ borderLeft: "3px solid var(--info)" }}
                >
                  <p className="font-medium leading-snug text-text">{it.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {it.source} · {it.evidence_type.replace(/_/g, " ")}
                  </p>
                  {it.content_summary && (
                    <p className="mt-1.5 leading-relaxed text-text-2">{it.content_summary}</p>
                  )}
                  {it.relevance && <p className="mt-1.5 text-xs font-medium text-text-2">{it.relevance}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No sources were cited for this decision.</p>
          )}
        </Card>
        <Card title={`Standards applied · ${record.policy_references.length}`}>
          {record.policy_references.length ? (
            <ul className="mt-3 space-y-2.5 text-sm">
              {record.policy_references.map((it) => (
                <li
                  key={it.policy_id}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2.5"
                  style={{ borderLeft: "3px solid var(--warn)" }}
                >
                  <p className="font-medium leading-snug text-text">
                    {it.section ? `§ ${it.section} · ` : ""}
                    {it.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{it.policy_code}</p>
                  {it.text_excerpt && (
                    <p className="mt-1.5 italic leading-relaxed text-text-2">&ldquo;{it.text_excerpt}&rdquo;</p>
                  )}
                  {it.application && (
                    <p className="mt-1.5 text-xs font-medium text-text-2">Applied: {it.application}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No methodology clauses were cited.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Agent">
          <p className="mt-3 font-medium text-text">{String(record.agent.name ?? "Unknown")}</p>
          <p className="mt-1 text-xs text-muted">
            {String(record.agent.domain ?? "")} · v{String(record.agent.version ?? "")}
          </p>
        </Card>
        <Card title="Timing">
          <p className="mt-3 text-sm">
            <span className="text-muted">Created</span>{" "}
            <span className="font-medium text-text">{formatTimestamp(task.created_at)}</span>
          </p>
          {task.completed_at && (
            <p className="mt-1 text-sm">
              <span className="text-muted">Completed</span>{" "}
              <span className="font-medium text-text">{formatTimestamp(task.completed_at)}</span>
            </p>
          )}
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
    setRecord(null);
    setError(null);
    api
      .getDecision(taskId)
      .then(setRecord)
      .catch((err: unknown) =>
        // A 404 means the record is genuinely gone (deleted, or the database was
        // reseeded). Anything else is a connection or server problem, and the
        // two need different advice.
        setError(err instanceof ApiError && err.status === 404 ? "missing" : "unreachable"),
      );
  }, [taskId]);

  const select = (t: Tab) => {
    setTab(t);
    setVisited((p) => new Set(p).add(t));
  };

  if (error)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center text-text">
        <span className="flex size-12 items-center justify-center rounded-full border border-border bg-surface text-muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5M12 16.2v.3" />
          </svg>
        </span>
        <div className="max-w-md">
          <h1 className="text-lg font-semibold tracking-tight">
            {error === "missing" ? "This decision record no longer exists" : "Can’t reach the ledger"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-2">
            {error === "missing" ? (
              <>
                Nothing is stored under this ID. It was either deleted before being sealed, or the
                database was reseeded after the link was created.
              </>
            ) : (
              <>
                The API at <code className="font-mono text-[13px]">{API_BASE}</code> did not respond.
                Check that the backend is running, then try again.
              </>
            )}
          </p>
          <p className="mt-3 font-mono text-[11px] text-muted">{taskId}</p>
        </div>
        <div className="flex gap-2.5">
          <a
            href="/"
            className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-ink-fg no-underline hover:brightness-95"
          >
            Back to board
          </a>
          {error === "unreachable" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-2 hover:bg-hover"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  if (!record)
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <p className="flex items-center gap-2.5 text-sm text-muted">
          <span className="size-2 animate-pulse rounded-full bg-muted-2" />
          Loading decision record…
        </p>
      </div>
    );

  const task = record.task as TaskData;
  // Headline the question, not the identifier. case_id used to BE the question
  // truncated to 75 chars, which is why long questions appeared cut off.
  const rawQ = task.inputs?.research_question ?? task.inputs?.prompt;
  const headline = typeof rawQ === "string" && rawQ.trim() ? rawQ.trim() : (task.case_id ?? taskId ?? "Research task");
  const statusEntry = lookup(STATUS, task.status);
  const riskEntry = lookup(RISK, task.risk_level);
  const reviewEntry = lookup(REVIEW, task.human_review_status);
  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-text">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-8">
          <div className="flex items-center gap-4">
            <a
              href="/"
              title="TrustLedger"
              className="flex items-center gap-3 no-underline"
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
            <a
              href="/"
              className="inline-block rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text-2 no-underline hover:bg-hover"
            >
              ← Back to board
            </a>
          </div>
          <div className="mt-3 rounded-[14px] border border-border bg-surface px-6 py-5 shadow-card">
            <p className="font-mono text-[11.5px] text-muted">{task.case_id ?? taskId}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-text">
              {headline}
            </h1>
            <p className="mt-1 text-sm text-text-2">{task.case_type ? clean(task.case_type) : "Research task"}</p>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
              A permanent record of one AI research decision — what was asked, what it was based on,
              and proof it has not been altered since.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {statusEntry && (
                <Chip hint="Status" label={statusEntry.label} tone={statusEntry.tone} title={statusEntry.meaning} />
              )}
              {riskEntry && (
                <Chip label={riskEntry.label} tone={riskEntry.tone} title={riskEntry.meaning} icon={<RiskIcon size={12} />} />
              )}
              {reviewEntry && (
                <Chip hint="Human" label={reviewEntry.label} tone={reviewEntry.tone} title={reviewEntry.meaning} />
              )}
              {record.audit_record && (
                <Chip
                  label={`Sealed · chain #${record.audit_record.chain_sequence}`}
                  tone="ok"
                  dot={false}
                  title="This record is on the hash chain. It can no longer be edited or deleted."
                />
              )}
            </div>
          </div>

          <div className="mt-4 border-b border-border" role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => select(t)}
                className={`mr-6 border-b-2 px-1 pb-3 text-sm font-medium ${
                  tab === t ? "border-ink text-text" : "border-transparent text-text-2 hover:text-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {/* Say what the selected tab is for — nobody should have to click all
              four to work out which one answers their question. */}
          <p className="mt-2.5 text-[13px] text-muted">{TAB_PURPOSE[tab]}</p>

          <div className="py-6" role="tabpanel">
            {tab === "Summary" && <Summary record={record} />}
            {tab === "Decision Trail" && <DecisionTimeline events={record.events} />}
            {visited.has("Replay") && (
              <div hidden={tab !== "Replay"}>
                <ReplayViewer taskId={taskId!} />
              </div>
            )}
            {visited.has("Integrity") && (
              <div hidden={tab !== "Integrity"}>
                <IntegrityPanel taskId={taskId!} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
