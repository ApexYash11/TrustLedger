import { EventOut } from "@/lib/api";

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function eventTitle(eventType: string) {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function DecisionTimeline({ events }: { events: EventOut[] }) {
  if (!events.length) {
    return <p className="rounded-lg border border-dashed border-stone-300 p-5 text-sm text-stone-500">No decision events have been recorded yet.</p>;
  }

  return (
    <ol className="space-y-0" aria-label="Decision event timeline">
      {events.map((event, index) => {
        const evidence = event.details?.evidence as { title?: string; content_summary?: string } | undefined;
        const policy = event.details?.policy_reference as { section?: string; title?: string; application?: string } | undefined;
        const isLast = index === events.length - 1;

        return (
          <li key={event.event_id} className="relative grid grid-cols-[2.5rem_1fr] gap-3 pb-6 last:pb-0">
            {!isLast && <span aria-hidden="true" className="absolute left-5 top-10 h-[calc(100%-1.5rem)] w-px bg-stone-200" />}
            <span className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border text-xs font-bold ${event.event_type === "record_sealed" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-600"}`}>
              {event.sequence}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-semibold text-stone-900">{eventTitle(event.event_type)}</h3>
                <time className="shrink-0 text-xs text-stone-400">{formatTimestamp(event.timestamp)}</time>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">{event.summary}</p>
              <p className="mt-1 text-xs text-stone-400">Recorded by {event.actor}</p>
              {evidence && (
                <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
                  <p className="font-medium text-stone-800">Evidence: {evidence.title ?? "Untitled evidence"}</p>
                  {evidence.content_summary && <p className="mt-1 text-stone-600">{evidence.content_summary}</p>}
                </div>
              )}
              {policy && (
                <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
                  <p className="font-medium text-stone-800">Policy: {[policy.section, policy.title].filter(Boolean).join(" — ") || "Referenced policy"}</p>
                  {policy.application && <p className="mt-1 text-stone-600">Applied: {policy.application}</p>}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
