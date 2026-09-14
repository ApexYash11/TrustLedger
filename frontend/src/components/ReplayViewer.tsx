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
    api.getReplay(taskId).then((r) => { if (active) setReplay(r); }).catch(() => { if (active) setError("Unable to load replay data."); });
    return () => { active = false; };
  }, [taskId]);

  useEffect(() => {
    if (!auto || !replay) return;
    const t = setInterval(() => setActiveIndex((i) => (i + 1) % replay.replay_steps.length), 1800);
    return () => clearInterval(t);
  }, [auto, replay]);

  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!replay) return <p className="rounded-lg border border-stone-200 p-5 text-sm text-stone-500">Loading replay…</p>;
  if (!replay.replay_steps.length) return <p className="rounded-lg border border-dashed border-stone-300 p-5 text-sm text-stone-500">No replay steps yet.</p>;

  const step = replay.replay_steps[activeIndex];
  const pct = ((activeIndex + 1) / replay.replay_steps.length) * 100;

  return (
    <section aria-label="Decision replay">
      <div className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
        <p className="text-xs leading-relaxed text-stone-600">Reconstructs the decision from the sealed audit record. <span className="font-medium text-stone-800">No agent is re-run.</span> For reviewers.</p>
        <button onClick={() => setAuto((v) => !v)} className={`rounded-full px-3 py-1 text-xs font-medium ${auto ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-600"}`}>{auto ? "⏸ Pause" : "▶ Auto-play"}</button>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium text-stone-700">Step {activeIndex + 1} of {replay.replay_steps.length}</span>
        <time className="text-stone-400">{formatTimestamp(step.timestamp)}</time>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${pct}%` }} /></div>

      {/* Step dots */}
      <div className="mb-5 flex gap-1.5">
        {replay.replay_steps.map((_, i) => (
          <button key={i} onClick={() => setActiveIndex(i)} className={`h-1.5 flex-1 rounded-full transition-colors ${i === activeIndex ? "bg-stone-900" : i < activeIndex ? "bg-stone-400" : "bg-stone-200"}`} aria-label={`Go to step ${i+1}`} />
        ))}
      </div>

      <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Step {step.step} · {humanize(step.title)}</p>
        <h3 className="mt-1 text-lg font-semibold text-stone-900">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{step.description}</p>
        {step.evidence.map((ev, i) => (
          <div key={`${ev.title}-${i}`} className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
            <span className="text-amber-600">◆</span>
            <div><p className="font-medium text-stone-800">{ev.title ?? "Evidence"}</p>{ev.summary && <p className="mt-1 text-stone-600">{ev.summary}</p>}</div>
          </div>
        ))}
        {step.policies.map((po, i) => (
          <div key={`${po.section}-${i}`} className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-stone-800">§ {po.section ?? ""} {po.title ? `· ${po.title}` : ""}</p>
            {po.text_excerpt && <p className="mt-1 text-stone-600">&ldquo;{po.text_excerpt}&rdquo;</p>}
            {po.application && <p className="mt-2 text-xs font-medium text-violet-700">Applied: {po.application}</p>}
          </div>
        ))}
      </article>

      <div className="mt-4 flex justify-between gap-3">
        <button disabled={activeIndex === 0} onClick={() => setActiveIndex((i) => i - 1)} className="rounded-md border border-stone-300 px-4 py-1.5 text-sm font-medium disabled:opacity-30">← Back</button>
        <button disabled={activeIndex === replay.replay_steps.length - 1} onClick={() => setActiveIndex((i) => i + 1)} className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-30">Next →</button>
      </div>

      {replay.final_decision && (
        <div className="mt-6 rounded-xl border border-stone-900 bg-stone-900 px-5 py-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Final recommendation</p>
          <p className="mt-1 text-base font-semibold">{humanize(replay.final_decision.outcome)}</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-300">{replay.final_decision.summary}</p>
        </div>
      )}
    </section>
  );
}
