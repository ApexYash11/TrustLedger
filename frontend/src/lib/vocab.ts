/**
 * The app's shared vocabulary: what each status, outcome and risk level is
 * called in plain language, what colour it carries, and what it actually means.
 *
 * Kept in one file so a colour means the same thing on every surface — a board
 * card, a record header, a replay step — and so the explanatory copy can never
 * drift out of sync with the label it explains.
 */

export type Tone = "ok" | "info" | "warn" | "danger" | "neutral";

/** Chip styling per tone, as inline styles so tokens resolve at runtime. */
export function toneStyle(tone: Tone): React.CSSProperties {
  return {
    color: `var(--${tone})`,
    background: `var(--${tone}-soft)`,
    borderColor: `var(--${tone}-line)`,
  };
}

export function toneColor(tone: Tone): string {
  return `var(--${tone})`;
}

type Entry = { label: string; tone: Tone; meaning: string };

/** Where a task sits in its lifecycle. */
export const STATUS: Record<string, Entry> = {
  queued: { label: "Queued", tone: "neutral", meaning: "Waiting for an agent to pick it up." },
  running: { label: "Running", tone: "warn", meaning: "An agent is working on it right now." },
  review_required: { label: "Needs review", tone: "info", meaning: "Sealed, and waiting on a person to sign off." },
  completed: { label: "Completed", tone: "ok", meaning: "Sealed to the audit chain. No further action needed." },
  disputed: { label: "Disputed", tone: "danger", meaning: "Flagged by a reviewer as contested." },
};

/** What the agent actually recommended. */
export const OUTCOME: Record<string, Entry & { icon: string }> = {
  recommended: { label: "Recommended", tone: "ok", icon: "✓", meaning: "Proceed. The evidence supports it." },
  recommended_with_caveats: { label: "Recommended with caveats", tone: "warn", icon: "◐", meaning: "Proceed, but conditions apply." },
  not_recommended: { label: "Not recommended", tone: "danger", icon: "✕", meaning: "Do not proceed on the current evidence." },
  escalated: { label: "Escalated", tone: "info", icon: "↑", meaning: "The agent declined to decide. A person must." },
};

/** How much is at stake if the recommendation is wrong. */
export const RISK: Record<string, Entry> = {
  // Labels are the bare level: the warning triangle already says "risk", and
  // "Medium risk" wrapped onto two lines inside a card chip.
  low: { label: "Low", tone: "ok", meaning: "Low risk — limited exposure if this call is wrong." },
  medium: { label: "Medium", tone: "warn", meaning: "Medium risk — material exposure. Worth a second read." },
  high: { label: "High", tone: "danger", meaning: "High risk — significant exposure. Treat with care." },
};

/** Whether a human still needs to look at it. */
export const REVIEW: Record<string, Entry> = {
  triggered: { label: "Review pending", tone: "info", meaning: "The agent asked for human sign-off." },
  not_required: { label: "No review needed", tone: "neutral", meaning: "The agent was confident enough to decide alone." },
  pending: { label: "Review pending", tone: "info", meaning: "Waiting on a reviewer." },
  approved: { label: "Reviewed", tone: "ok", meaning: "A person has signed this off." },
};

/** Look a value up, falling back to a readable label rather than blank. */
export function lookup<T extends Entry>(
  table: Record<string, T>,
  key: string | null | undefined,
): T | null {
  if (!key) return null;
  return table[key] ?? null;
}

/** What each tab on the record page is for, in one line. */
export const TAB_PURPOSE: Record<string, string> = {
  Summary: "The recommendation, and the sources and standards behind it.",
  "Decision Trail": "Every step the agent took, in the order it took them.",
  Replay: "Walk the decision one step at a time, rebuilt from the sealed record.",
  Integrity: "Prove the record has not been altered since it was sealed.",
};
