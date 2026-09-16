"use client";

import { useEffect, useState } from "react";
import { api, ReplayResponse } from "@/lib/api";
import { formatTimestamp, humanize } from "@/lib/format";

export default function ReplayViewer({ taskId }: { taskId: string }) {
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    let active = true;
    setReplay(null);
    setError(null);
    setActiveIndex(0);
    api
      .getReplay(taskId)
      .then((r) => {
        if (active) setReplay(r);
      })
      .catch(() => {
        if (active) setError("Unable to load replay data.");
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  useEffect(() => {
    if (!auto || !replay) return;
    const t = setInterval(() => setActiveIndex((i) => (i + 1) % replay.replay_steps.length), 1800);
    return () => clearInterval(t);
  }, [auto, replay]);

  if (error) return <p role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm text-text-2">{error}</p>;
  if (!replay) return <p className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">Loading replay…</p>;
  if (!replay.replay_steps.length)
    return <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">No replay steps yet.</p>;

  const step = replay.replay_steps[activeIndex];
  const pct = ((activeIndex + 1) / replay.replay_steps.length) * 100;

  return (
    <section aria-label="Decision replay">
      <div className="mb-4 flex items-center justify-between rounded-[14px] border border-border bg-surface-2 px-4 py-3">
        <p className="text-xs leading-relaxed text-text-2">
          Reconstructs the decision from the sealed audit record. <span className="font-medium text-ink">No agent is re-run.</span> For reviewers.
        </p>
        <button
          type="button"
          onClick={() => setAuto((v) => !v)}
          className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium ${
            auto ? "bg-ink text-ink-fg" : "border border-border bg-surface text-text-2 hover:bg-hover"
          }`}
        >
          {auto ? "⏸ Pause" : "▶ Auto-play"}
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium text-text-2">
          Step {activeIndex + 1} of {replay.replay_steps.length}
        </span>
        <time className="text-muted">{formatTimestamp(step.timestamp)}</time>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Step dots */}
      <div className="mb-5 flex gap-1.5">
        {replay.replay_steps.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 flex-1 cursor-pointer rounded-full transition-colors ${
              i === activeIndex ? "bg-ink" : i < activeIndex ? "bg-muted-2" : "bg-[var(--border)]"
            }`}
            aria-label={`Go to step ${i + 1}`}
          />
        ))}
      </div>

      <article className="rounded-[14px] border border-border bg-surface p-5 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Step {step.step} · {humanize(step.title)}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-text">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-2">{step.description}</p>
        {step.evidence.map((ev, i) => (
          <div key={`${ev.title}-${i}`} className="mt-3 flex gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
            <span className="text-muted">◆</span>
            <div>
              <p className="font-medium text-text">{ev.title ?? "Evidence"}</p>
              {ev.summary && <p className="mt-1 text-text-2">{ev.summary}</p>}
            </div>
          </div>
        ))}
        {step.policies.map((po, i) => (
          <div key={`${po.section}-${i}`} className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
            <p className="font-medium text-text">
              § {po.section ?? ""} {po.title ? `· ${po.title}` : ""}
            </p>
            {po.text_excerpt && <p className="mt-1 text-text-2">&ldquo;{po.text_excerpt}&rdquo;</p>}
            {po.application && <p className="mt-2 text-xs font-medium text-ink">Applied: {po.application}</p>}
          </div>
        ))}
      </article>

      <div className="mt-4 flex justify-between gap-3">
        <button
          type="button"
          disabled={activeIndex === 0}
          onClick={() => setActiveIndex((i) => i - 1)}
          className="cursor-pointer rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-2 hover:bg-hover disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={activeIndex === replay.replay_steps.length - 1}
          onClick={() => setActiveIndex((i) => i + 1)}
          className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-ink-fg hover:brightness-96 disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {replay.final_decision && (
        <div className="mt-6 rounded-[14px] bg-ink px-5 py-4 text-ink-fg shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[rgba(245,243,240,.5)]">Final recommendation</p>
          <p className="mt-1 text-base font-semibold">{humanize(replay.final_decision.outcome)}</p>
          <p className="mt-1 text-sm leading-relaxed text-[rgba(245,243,240,.75)]">{replay.final_decision.summary}</p>
        </div>
      )}
    </section>
  );
}
