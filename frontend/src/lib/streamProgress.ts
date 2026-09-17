/**
 * Reads a partially-streamed model response and pulls out whatever is already
 * readable.
 *
 * The agent replies in one JSON object, so the raw token stream is scaffolding —
 * `"content_summary": "Analysis of compliance risks…",` — which is unreadable as
 * live progress. Rather than show that, we scan the buffer for fields that have
 * finished arriving and render those. A value only counts once its closing quote
 * is present, so nothing half-written is ever displayed.
 */

export type StreamSource = { title: string; source: string | null };

export type StreamProgress = {
  stage: string;
  primaryReason: string | null;
  outcomeSummary: string | null;
  outcome: string | null;
  confidence: number | null;
  risk: string | null;
  factors: string[];
  sources: StreamSource[];
  policies: StreamSource[];
};

const unescape = (s: string) =>
  s.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\\\\/g, "\\").trim();

/** A completed string field — requires the closing quote, so never half-written. */
function strField(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? unescape(m[1]) || null : null;
}

function numField(raw: string, key: string): number | null {
  const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : null;
}

/** The contents of the array at `key`, bounded by its own closing bracket.

    Slicing to the end of the buffer instead let one array absorb the next:
    `evidence_details` picked up every object in `policy_details` too. Still
    returns a body when the array is mid-stream and unterminated. */
function arrayBody(raw: string, key: string): string | null {
  const start = raw.indexOf(`"${key}"`);
  if (start === -1) return null;
  const open = raw.indexOf("[", start);
  if (open === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return raw.slice(open + 1, i);
    }
  }
  return raw.slice(open + 1); // array has not finished streaming yet
}

/** Completed string items from a top-level array, e.g. supporting_factors. */
function strArray(raw: string, key: string, limit = 4): string[] {
  const body = arrayBody(raw, key);
  if (body === null) return [];
  const out: string[] = [];
  // exec loop rather than matchAll: the project's tsconfig sets no `target`, so
  // iterating a RegExp match iterator would need downlevelIteration.
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null && out.length < limit) {
    const v = unescape(m[1]);
    if (v) out.push(v);
  }
  return out;
}

/** Objects already finished inside an array of records (evidence/policy details). */
function objArray(raw: string, key: string, titleKeys: string[], subKeys: string[]): StreamSource[] {
  const body = arrayBody(raw, key);
  if (body === null) return [];
  const out: StreamSource[] = [];
  // Only complete { … } blocks count; a trailing partial object is ignored.
  const re = /\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const block = m[0];
    const title = titleKeys.map((k) => strField(block, k)).find(Boolean) ?? null;
    if (!title) continue;
    const sub = subKeys.map((k) => strField(block, k)).find(Boolean) ?? null;
    out.push({ title, source: sub });
  }
  return out;
}

export function readProgress(raw: string): StreamProgress {
  const outcome = strField(raw, "outcome");
  const sources = objArray(raw, "evidence_details", ["title"], ["source"]);
  const policies = objArray(raw, "policy_details", ["title", "policy_code"], ["policy_code", "section"]);

  // Stage tracks the deepest field the model has reached, since it emits the
  // object roughly in the order the system prompt lists the keys.
  let stage = "Reading the question";
  if (raw.includes('"primary_reason"')) stage = "Forming a view";
  if (raw.includes('"supporting_factors"')) stage = "Weighing the factors";
  if (raw.includes('"evidence_basis"') || raw.includes('"evidence_details"')) stage = "Citing sources";
  if (raw.includes('"policy_details"')) stage = "Applying standards";
  if (outcome) stage = "Reaching a recommendation";

  return {
    stage,
    primaryReason: strField(raw, "primary_reason"),
    outcomeSummary: strField(raw, "outcome_summary"),
    outcome,
    confidence: numField(raw, "confidence_score"),
    risk: strField(raw, "risk_level"),
    factors: strArray(raw, "supporting_factors"),
    sources,
    policies,
  };
}

/** True when the buffer looks like model JSON rather than template step text. */
export function looksStructured(raw: string): boolean {
  return raw.trimStart().startsWith("{") || raw.includes('"primary_reason"') || raw.includes('"outcome"');
}
