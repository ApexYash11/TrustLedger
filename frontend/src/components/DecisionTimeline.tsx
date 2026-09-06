"use client";

import { EventOut } from "@/lib/api";

/**
 * DecisionTimeline — sequenced timeline of record.events.
 * Calm editorial style: hairline rules, no nested cards or expanders.
 */
export default function DecisionTimeline({ events }: { events: EventOut[] }) {
  if (events.length === 0) {
    return <p className="text-stone-400 text-sm italic">No events recorded for this decision.</p>;
  }

  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  return (
    <ol className="divide-y divide-stone-200">
      {sorted.map((e) => (
        <li key={e.event_id} className="py-4 flex gap-5 first:pt-0">
          <span className="w-6 shrink-0 text-right font-serif italic text-stone-400">
            {e.sequence}
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] text-stone-900">{e.summary}</h3>
            <p className="text-xs text-stone-400 mt-1">
              {e.event_type.replace(/_/g, " ")} · {new Date(e.timestamp).toLocaleString()} · {e.actor}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
