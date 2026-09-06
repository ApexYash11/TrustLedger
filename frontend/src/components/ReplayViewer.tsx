"use client";

import { useEffect, useState } from "react";
import { api, ReplayResponse } from "@/lib/api";
import { getDemoReplay } from "@/lib/demoData";
import { formatTimestamp, humanize } from "@/lib/format";

export default function ReplayViewer({ taskId }: { taskId: string }) {
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setReplay(null);
    setError(null);
    setActiveIndex(0);

    api
      .getReplay(taskId)
      .then((response) => {
        if (active) setReplay(response);
      })
      .catch(() => {
        // Static preview records (demo-*) are served locally, not from the API.
        const demo = getDemoReplay(taskId);
        if (active) {
          if (demo) setReplay(demo);
          else setError("Unable to load replay data.");
        }
      });

    return () => {
      active = false;
    };
  }, [taskId]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!replay) {
    return <p className="rounded-lg border border-stone-200 p-5 text-sm text-stone-500">Loading replay data…</p>;
  }

  if (!replay.replay_steps.length) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 p-5 text-sm text-stone-500">
        No replay steps are available for this decision.
      </p>
    );
  }

  const step = replay.replay_steps[activeIndex];
  const progress = ((activeIndex + 1) / replay.replay_steps.length) * 100;
  const primaryButton =
    "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section aria-label="Decision replay">
      <p className="mb-5 text-sm text-stone-600">
        Reconstruct this decision from its stored audit record. No agent is re-executed.
      </p>

      <div className="mb-5 flex items-center justify-between text-sm">
        <span className="font-medium text-stone-800">
          Step {activeIndex + 1} of {replay.replay_steps.length}
        </span>
        <time className="text-stone-400">{formatTimestamp(step.timestamp)}</time>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Replay progress"
      >
        <div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <article className="mt-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Step {step.step}</p>
        <h3 className="mt-1 text-lg font-semibold text-stone-900">{step.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{step.description}</p>

        {step.evidence.map((evidence, index) => (
          <div key={`${evidence.title}-${index}`} className="mt-4 rounded-md bg-stone-50 p-3 text-sm">
            <p className="font-medium text-stone-800">Evidence: {evidence.title ?? "Untitled evidence"}</p>
            {evidence.summary && <p className="mt-1 text-stone-600">{evidence.summary}</p>}
          </div>
        ))}

        {step.policies.map((policy, index) => (
          <div key={`${policy.section}-${index}`} className="mt-4 rounded-md bg-stone-50 p-3 text-sm">
            <p className="font-medium text-stone-800">
              Policy: {[policy.section, policy.title].filter(Boolean).join(" - ") || "Referenced policy"}
            </p>
            {policy.text_excerpt && <p className="mt-1 text-stone-600">{policy.text_excerpt}</p>}
            {policy.application && <p className="mt-2 text-stone-600">Applied: {policy.application}</p>}
          </div>
        ))}
      </article>

      <div className="mt-5 flex justify-between gap-3">
        <button
          type="button"
          disabled={activeIndex === 0}
          onClick={() => setActiveIndex((index) => index - 1)}
          className={`${primaryButton} border border-stone-300 text-stone-700 hover:bg-stone-50`}
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={activeIndex === replay.replay_steps.length - 1}
          onClick={() => setActiveIndex((index) => index + 1)}
          className={`${primaryButton} bg-stone-900 text-white hover:bg-stone-700`}
        >
          Next →
        </button>
      </div>

      {replay.final_decision && (
        <section className="mt-6 border-t border-stone-200 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Final Decision</h3>
          <p className="mt-2 font-medium text-stone-900">{humanize(replay.final_decision.outcome)}</p>
          <p className="mt-1 text-sm text-stone-600">{replay.final_decision.summary}</p>
        </section>
      )}
    </section>
  );
}

