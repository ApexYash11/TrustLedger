"use client";

import { useCallback, useEffect, useState } from "react";
import { api, VerifyResponse } from "@/lib/api";
import { formatTimestamp, humanize } from "@/lib/format";

export default function IntegrityPanel({ taskId }: { taskId: string }) {
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const verify = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.verifyDecision(taskId));
    } catch {
      setError("Unable to verify. Try again.");
    } finally {
      setBusy(false);
    }
  }, [taskId]);

  useEffect(() => {
    void verify();
  }, [verify]);

  if (error && !result)
    return <p role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm text-text-2">{error}</p>;
  if (!result) return <p className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">Checking seal…</p>;

  const ok = result.verified;
  const unsealed = result.chain_status === "unsealed";
  const dark = !ok && !unsealed; // tampered: dark card in the monochrome system

  return (
    <section aria-live="polite">
      <div
        className={`rounded-[14px] border-2 p-5 shadow-card ${
          ok ? "border-ink bg-surface" : unsealed ? "border-border bg-surface-2" : "border-ink bg-ink"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              ok ? "bg-ink text-ink-fg" : unsealed ? "bg-muted-2 text-surface" : "bg-surface text-ink"
            }`}
          >
            {ok ? "✓" : "!"}
          </span>
          <div>
            <p className={`text-sm font-bold ${dark ? "text-ink-fg" : "text-text"}`}>
              {ok ? "Verified — not tampered" : unsealed ? "Not yet sealed" : "Tamper detected"}
            </p>
            <p className={`mt-1 text-sm leading-relaxed ${dark ? "text-[rgba(245,243,240,.75)]" : "text-text-2"}`}>
              {ok
                ? "Hash recomputes correctly and chain links to the previous record. Safe to rely on."
                : unsealed
                  ? "This draft has not been sealed to the chain yet — verify after it completes."
                  : "Hash mismatch or broken chain link. Record may have been edited after sealing."}
            </p>
            <p className={`mt-2 text-xs ${dark ? "text-[rgba(245,243,240,.6)]" : "text-muted"}`}>{result.message}</p>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-[14px] border border-border bg-surface text-sm shadow-card">
        <div className="border-b border-r border-border bg-surface-2 p-4">
          <dt className="text-xs uppercase tracking-widest text-muted">Sealed at</dt>
          <dd className="mt-1 font-medium text-text">{formatTimestamp(result.sealed_at)}</dd>
        </div>
        <div className="border-b border-border bg-surface-2 p-4">
          <dt className="text-xs uppercase tracking-widest text-muted">Chain position</dt>
          <dd className="mt-1 font-medium text-text">{result.chain_sequence == null ? "—" : `#${result.chain_sequence}`}</dd>
        </div>
        <div className="col-span-2 flex items-center justify-between p-4">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">Chain status</dt>
            <dd className="mt-1 font-medium text-text">{humanize(result.chain_status)}</dd>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              ok ? "bg-ink text-ink-fg" : "border border-border bg-surface-2 text-text-2"
            }`}
          >
            {ok ? "intact" : "broken"}
          </span>
        </div>
      </dl>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => void verify()}
          disabled={busy}
          className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-ink-fg hover:brightness-96 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Verify again"}
        </button>
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="cursor-pointer border-none bg-transparent text-sm font-medium text-text-2 underline underline-offset-2"
        >
          {showTech ? "Hide hashes" : "Show hashes"}
        </button>
      </div>
      {showTech && (
        <dl className="mt-3 space-y-2 rounded-lg border border-border bg-surface-2 p-4 font-mono text-xs">
          <div>
            <dt className="font-semibold text-text-2">record_hash</dt>
            <dd className="mt-1 break-all text-muted">{result.record_hash ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-text-2">previous_hash</dt>
            <dd className="mt-1 break-all text-muted">{result.previous_hash ?? "—"}</dd>
          </div>
        </dl>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-text-2">{error}</p>}
    </section>
  );
}
