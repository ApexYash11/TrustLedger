"use client";

import type { EvidenceOut, FullDecisionRecord, PolicyRefOut } from "@/lib/api";
import { OUTCOME, lookup } from "@/lib/vocab";

/**
 * Knowledge graph for one decision: client → question → the facts it rests on →
 * the recommendation.
 *
 * Everything is drawn inside a single SVG with a computed layout. The earlier
 * version mixed HTML nodes at fixed pixel offsets with an SVG stretched by
 * preserveAspectRatio="none", so the edges slid away from the boxes as the
 * viewport changed and the outcome card landed on top of the evidence stack.
 * Here node positions and edge endpoints come from the same numbers, so they
 * cannot disagree, and the whole diagram scales as one picture.
 */

const VB_W = 1000;
const FACT_W = 312;
const FACT_H = 62;
const FACT_GAP = 13;
const COL_Q = { x: 150, w: 236 };
const COL_FACT_X = 462;
const COL_OUT = { x: 818, w: 176 };
const MAX_EVIDENCE = 4;
const MAX_POLICIES = 3;

type Node = {
  key: string;
  kind: "evidence" | "policy";
  relation: string;
  title: string;
  sub: string;
  y: number;
};

/** Greedy word wrap for SVG text, which has no automatic wrapping. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const shown = lines.join(" ").length;
  if (shown < words.join(" ").length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines;
}

function buildNodes(evidence: EvidenceOut[], policies: PolicyRefOut[]) {
  const ev = evidence.slice(0, MAX_EVIDENCE);
  const po = policies.slice(0, MAX_POLICIES);
  const rows = ev.length + po.length;
  const stackH = rows * FACT_H + Math.max(0, rows - 1) * FACT_GAP;
  const height = Math.max(stackH + 34, 208);
  const top = (height - stackH) / 2;

  const nodes: Node[] = [];
  ev.forEach((e, i) => {
    nodes.push({
      key: e.evidence_id ?? `ev-${i}`,
      kind: "evidence",
      relation: "supports",
      title: e.title || "Untitled source",
      sub: [e.source, e.evidence_type?.replace(/_/g, " ")].filter(Boolean).join(" · "),
      y: top + i * (FACT_H + FACT_GAP),
    });
  });
  po.forEach((p, i) => {
    nodes.push({
      key: p.policy_id ?? `pol-${i}`,
      kind: "policy",
      relation: "applies_to",
      title: [p.section && `§ ${p.section}`, p.title].filter(Boolean).join(" · ") || "Methodology clause",
      sub: p.policy_code || "",
      y: top + (ev.length + i) * (FACT_H + FACT_GAP),
    });
  });

  return {
    nodes,
    height,
    hiddenEvidence: Math.max(0, evidence.length - ev.length),
    hiddenPolicies: Math.max(0, policies.length - po.length),
  };
}

export default function DecisionGraph({ record }: { record: FullDecisionRecord }) {
  const task = record.task as { inputs?: Record<string, unknown>; case_id?: string; status?: string };
  const decision = record.decision as { outcome?: string; confidence_score?: number | null } | null;

  // Deliberately do NOT fall back to the case ID. A record with no question is
  // a record where the agent answered something nobody asked, and showing an
  // identifier in the question slot disguises exactly that.
  const rawQuestion = task.inputs?.research_question ?? task.inputs?.prompt;
  const question = typeof rawQuestion === "string" && rawQuestion.trim() ? rawQuestion.trim() : null;
  const client = String(task.inputs?.client_name ?? "Client");
  const outcomeEntry = lookup(OUTCOME, decision?.outcome);
  const conf = decision?.confidence_score != null ? Math.round(decision.confidence_score * 100) : null;
  const chainSeq = record.audit_record?.chain_sequence;

  const { nodes, height, hiddenEvidence, hiddenPolicies } = buildNodes(
    record.evidence ?? [],
    record.policy_references ?? [],
  );
  const cy = height / 2;

  if (!decision) {
    return (
      <section className="rounded-[14px] border border-border bg-surface p-5 shadow-card">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">How this decision links together</h2>
        <p className="mt-3 text-sm text-text-2">
          The graph appears once the decision is sealed — every source and standard will link to the recommendation.
        </p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span className="size-2 animate-pulse rounded-full bg-ink" />
          Agent is still reasoning…
        </p>
      </section>
    );
  }

  const outTone = outcomeEntry ? `var(--${outcomeEntry.tone})` : "var(--ink)";
  const qRight = COL_Q.x + COL_Q.w;
  const factRight = COL_FACT_X + FACT_W;

  return (
    <section className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-card">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">How this decision links together</h2>
        <p className="mt-1 text-xs text-muted">
          Boxes are things. Lines are how they relate. Every fact points at the recommendation it supports.
        </p>
      </header>

      <div className="overflow-x-auto bg-surface-2 px-4 py-4">
        <svg
          viewBox={`0 0 ${VB_W} ${height}`}
          className="h-auto w-full min-w-[680px]"
          role="img"
          aria-label={`Decision graph: ${nodes.length} facts supporting the recommendation`}
        >
          {/* Edges first so nodes paint over their endpoints */}
          {nodes.map((n, i) => {
            const my = n.y + FACT_H / 2;
            const stroke = n.kind === "policy" ? "var(--warn)" : "var(--info)";
            // Spread arrival points over the outcome's edge so five curves do not
            // all pile onto the same pixel.
            const spread = nodes.length > 1 ? (i / (nodes.length - 1) - 0.5) * 44 : 0;
            const arriveY = cy + spread;
            return (
              <g key={`e-${n.key}`} opacity="0.55">
                <path
                  d={`M ${qRight} ${cy} C ${qRight + 52} ${cy}, ${COL_FACT_X - 52} ${my}, ${COL_FACT_X} ${my}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.4"
                />
                <path
                  d={`M ${factRight} ${my} C ${factRight + 34} ${my}, ${COL_OUT.x - 34} ${arriveY}, ${COL_OUT.x} ${arriveY}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.4"
                />
              </g>
            );
          })}

          {/* Client → question */}
          <path d={`M 122 ${cy} L ${COL_Q.x} ${cy}`} stroke="var(--faint)" strokeWidth="1.3" strokeDasharray="4 4" fill="none" />

          {/* Client */}
          <g>
            <rect x="4" y={cy - 24} width="118" height="48" rx="9" fill="var(--surface)" stroke="var(--border)" />
            <text x="16" y={cy - 7} className="fill-[var(--muted)] text-[9px] font-semibold uppercase tracking-[0.11em]">
              Client
            </text>
            <text x="16" y={cy + 11} className="fill-[var(--text)] text-[12px] font-semibold">
              {wrap(client, 14, 1)[0] ?? "—"}
            </text>
          </g>

          {/* Research question */}
          <g>
            <rect
              x={COL_Q.x}
              y={cy - 40}
              width={COL_Q.w}
              height="80"
              rx="11"
              fill="var(--surface)"
              stroke={question ? "var(--ink)" : "var(--danger)"}
              strokeWidth="1.8"
            />
            <text x={COL_Q.x + 15} y={cy - 21} className="fill-[var(--muted)] text-[9px] font-semibold uppercase tracking-[0.11em]">
              Research question
            </text>
            {question ? (
              wrap(question, 33, 3).map((line, i) => (
                <text key={i} x={COL_Q.x + 15} y={cy - 3 + i * 15} className="fill-[var(--text)] text-[12px] font-semibold">
                  {line}
                </text>
              ))
            ) : (
              <>
                <text x={COL_Q.x + 15} y={cy - 1} className="text-[12px] font-semibold" fill="var(--danger)">
                  No question recorded
                </text>
                <text x={COL_Q.x + 15} y={cy + 15} className="fill-[var(--muted)] text-[10px]">
                  The agent was given only a client name.
                </text>
              </>
            )}
          </g>

          {/* Facts */}
          {nodes.map((n) => {
            const tint = n.kind === "policy" ? "var(--warn)" : "var(--info)";
            return (
              <g key={n.key}>
                <rect
                  x={COL_FACT_X}
                  y={n.y}
                  width={FACT_W}
                  height={FACT_H}
                  rx="9"
                  fill="var(--surface)"
                  stroke={tint}
                  strokeWidth="1.1"
                  opacity="0.95"
                />
                <rect x={COL_FACT_X} y={n.y} width="3.5" height={FACT_H} rx="1.75" fill={tint} />
                <text x={COL_FACT_X + 14} y={n.y + 17} className="text-[8.5px] font-semibold uppercase tracking-[0.1em]" fill={tint}>
                  {n.relation}
                </text>
                {wrap(n.title, 40, 1).map((line, i) => (
                  <text key={i} x={COL_FACT_X + 14} y={n.y + 34} className="fill-[var(--text)] text-[11.5px] font-semibold">
                    {line}
                  </text>
                ))}
                <text x={COL_FACT_X + 14} y={n.y + 50} className="fill-[var(--muted)] text-[10px]">
                  {wrap(n.sub, 46, 1)[0] ?? ""}
                </text>
              </g>
            );
          })}

          {/* Outcome */}
          <g>
            <rect x={COL_OUT.x} y={cy - 44} width={COL_OUT.w} height="88" rx="12" fill="var(--ink)" />
            <text x={COL_OUT.x + 16} y={cy - 24} className="text-[9px] font-semibold uppercase tracking-[0.11em]" fill="rgba(245,243,240,.55)">
              Recommendation
            </text>
            <circle cx={COL_OUT.x + 27} cy={cy + 2} r="11" fill={outTone} />
            <text x={COL_OUT.x + 27} y={cy + 6} textAnchor="middle" className="text-[11px] font-bold" fill="#fff">
              {outcomeEntry?.icon ?? "•"}
            </text>
            {wrap(outcomeEntry?.label ?? "Decided", 16, 2).map((line, i) => (
              <text key={i} x={COL_OUT.x + 46} y={cy - 1 + i * 14} className="text-[12.5px] font-semibold" fill="var(--ink-fg)">
                {line}
              </text>
            ))}
            {conf != null && (
              <text x={COL_OUT.x + 16} y={cy + 32} className="text-[10.5px]" fill="rgba(245,243,240,.65)">
                {conf}% confidence
              </text>
            )}
          </g>
        </svg>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface px-5 py-2.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--info)" }} />
          {record.evidence?.length ?? 0} source{(record.evidence?.length ?? 0) === 1 ? "" : "s"} · supports
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--warn)" }} />
          {record.policy_references?.length ?? 0} standard{(record.policy_references?.length ?? 0) === 1 ? "" : "s"} · applies_to
        </span>
        {(hiddenEvidence > 0 || hiddenPolicies > 0) && (
          <span>+{hiddenEvidence + hiddenPolicies} more listed below</span>
        )}
        <span className="ml-auto font-mono">{chainSeq != null ? `Sealed · chain #${chainSeq}` : "Not yet sealed"}</span>
      </footer>
    </section>
  );
}
