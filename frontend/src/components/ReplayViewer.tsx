"use client";

import { ReplayResponse } from "@/lib/api";

/**
 * ReplayViewer — step-by-step replay of how the decision was reached.
 * Editorial list, hairline dividers, serif step numerals.
 */
export default function ReplayViewer({ replay }: { replay: ReplayResponse }) {
  if (replay.replay_steps.length === 0) {
    return <p className="text-stone-400 text-sm italic">No replay steps available for this decision.</p>;
  }

  return (
    <div>
      {replay.final_decision && (
        <div className="mb-8 pb-8 border-b border-stone-200">
          <p className="text-[11px] uppercase tracking-[0.15em] text-stone-400 mb-2">
            Final outcome
          </p>
          <p className="font-serif italic text-xl text-stone-900">
            {replay.final_decision.outcome.replace(/_/g, " ")}
          </p>
          <p className="text-sm text-stone-600 mt-1 max-w-prose">
            {replay.final_decision.summary}
          </p>
        </div>
      )}

      <ol className="divide-y divide-stone-200">
        {replay.replay_steps.map((step) => (
          <li key={step.step} className="py-5 flex gap-5 first:pt-0">
            <span className="w-6 shrink-0 text-right font-serif italic text-stone-400">
              {step.step}
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] text-stone-900">{step.title}</h3>
              <p className="text-sm text-stone-600 mt-1 max-w-prose">{step.description}</p>
              <p className="text-xs text-stone-400 mt-1">
                {new Date(step.timestamp).toLocaleString()}
              </p>

              {step.evidence.length > 0 && (
                <p className="text-xs text-stone-500 mt-2">
                  <span className="text-stone-400">Evidence — </span>
                  {step.evidence.map((ev) => ev.title).join(", ")}
                </p>
              )}
              {step.policies.length > 0 && (
                <p className="text-xs text-stone-500 mt-1">
                  <span className="text-stone-400">Policies — </span>
                  {step.policies.map((p) => p.section).join(", ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
