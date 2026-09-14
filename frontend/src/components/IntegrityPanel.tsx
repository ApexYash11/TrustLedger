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
    setBusy(true); setError(null);
    try { setResult(await api.verifyDecision(taskId)); } catch { setError("Unable to verify. Try again."); } finally { setBusy(false); }
  }, [taskId]);

  useEffect(() => { void verify(); }, [verify]);

  if (error && !result) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!result) return <p className="rounded-lg border border-stone-200 p-5 text-sm text-stone-500">Checking seal…</p>;

  const ok = result.verified;
  return (
    <section aria-live="polite">
      <div className={`rounded-xl border-2 p-5 ${ok ? "border-emerald-300 bg-emerald-50" : result.chain_status === "unsealed" ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"}`}>
        <div className="flex items-start gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{ok ? "✓" : "!"}</span>
          <div>
            <p className={`text-sm font-bold ${ok ? "text-emerald-800" : "text-red-800"}`}>{ok ? "Verified — not tampered" : result.chain_status === "unsealed" ? "Not yet sealed" : "Tamper detected"}</p>
            <p className="mt-1 text-sm leading-relaxed text-stone-700">{ok ? "Hash recomputes correctly and chain links to the previous record. Safe to rely on." : result.chain_status === "unsealed" ? "This draft has not been sealed to the chain yet — verify after it completes." : "Hash mismatch or broken chain link. Record may have been edited after sealing."}</p>
            <p className="mt-2 text-xs text-stone-500">{result.message}</p>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-stone-200 text-sm">
        <div className="border-b border-r border-stone-200 bg-stone-50 p-4">
          <dt className="text-xs uppercase tracking-widest text-stone-400">Sealed at</dt>
          <dd className="mt-1 font-medium text-stone-900">{formatTimestamp(result.sealed_at)}</dd>
        </div>
        <div className="border-b border-stone-200 bg-stone-50 p-4">
          <dt className="text-xs uppercase tracking-widest text-stone-400">Chain position</dt>
          <dd className="mt-1 font-medium text-stone-900">{result.chain_sequence == null ? "—" : `#${result.chain_sequence}`}</dd>
        </div>
        <div className="col-span-2 flex items-center justify-between bg-white p-4">
          <div><dt className="text-xs uppercase tracking-widest text-stone-400">Chain status</dt><dd className="mt-1 font-medium text-stone-900">{humanize(result.chain_status)}</dd></div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{ok ? "intact" : "broken"}</span>
        </div>
      </dl>

      <div className="mt-4 flex gap-3">
        <button onClick={() => void verify()} disabled={busy} className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Checking…" : "Verify again"}</button>
        <button onClick={() => setShowTech((v) => !v)} className="text-sm font-medium text-stone-600 underline underline-offset-2">{showTech ? "Hide hashes" : "Show hashes"}</button>
      </div>
      {showTech && (
        <dl className="mt-3 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-4 font-mono text-xs">
          <div><dt className="font-semibold text-stone-600">record_hash</dt><dd className="mt-1 break-all text-stone-500">{result.record_hash ?? "—"}</dd></div>
          <div><dt className="font-semibold text-stone-600">previous_hash</dt><dd className="mt-1 break-all text-stone-500">{result.previous_hash ?? "—"}</dd></div>
        </dl>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
