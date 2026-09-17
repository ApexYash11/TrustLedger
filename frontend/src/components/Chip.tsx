"use client";

import { toneStyle, type Tone } from "@/lib/vocab";

/**
 * A labelled status chip.
 *
 * The `label` prop is what the value IS ("Medium risk"), and `hint` is the
 * field it belongs to ("Risk"). Showing both matters: the record header used to
 * render three unlabelled grey pills reading "Completed", "medium" and "Not
 * Required", which left the reader to guess medium *what*.
 */
/** Warning triangle — the glyph that means "risk", so the word isn't needed. */
export function RiskIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M8 2.4 1.7 13.1h12.6L8 2.4Z" />
      <path d="M8 6.5v3M8 11.3v.3" />
    </svg>
  );
}

export default function Chip({
  hint,
  label,
  tone = "neutral",
  title,
  dot = true,
  icon,
  size = "md",
}: {
  /** The field this value belongs to, e.g. "Risk". Omit when self-evident. */
  hint?: string;
  label: string;
  tone?: Tone;
  /** Hover explanation — the plain-language meaning from the vocab table. */
  title?: string;
  dot?: boolean;
  /** Replaces the dot. Use when a glyph conveys the field better than a word. */
  icon?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${pad}`}
      style={toneStyle(tone)}
    >
      {icon ?? (dot && <span className="size-1.5 shrink-0 rounded-full" style={{ background: "currentColor" }} />)}
      {hint && <span className="opacity-60">{hint}</span>}
      <span>{label}</span>
    </span>
  );
}
