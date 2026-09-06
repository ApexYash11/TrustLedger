/** Shared human-friendly formatting helpers used across the decision UI. */

/** Humanize a snake_case value: "approved_with_notes" -> "Approved With Notes". */
export function humanize(value?: string | null): string {
  return value
    ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Not available";
}

/** Format an ISO timestamp for display; falls back to the raw value if unparseable. */
export function formatTimestamp(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
