"use client";

import { useState } from "react";
import { api, VerifyResponse } from "@/lib/api";

/**
 * IntegrityPanel — pass/fail verification of the sealed audit record.
 * Status is conveyed by icon + text label in addition to color
 * (issue #7: color must not be the sole indicator).
 * Flat editorial style: hairline border, definition list, no chips or cards-in-cards.
 */
export default function IntegrityPanel({
  taskId,
  initial,
}: {
  taskId: string;
  initial: VerifyResponse | null;
}) {
  const [result, setResult] = useState<VerifyResponse | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyNow = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.verifyDecision(taskId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification request failed");
    } finally {
      setLoading(false);
    }
  };

  if (!result) {
    return (
      <div>
        <p className="text-stone-500 text-sm italic">
          {error
            ? `Verification could not be run: ${error}`
            : "This record has not been sealed yet — integrity cannot be checked."}
        </p>
        <button
          onClick={verifyNow}
          disabled={loading}
          className="mt-4 text-sm text-stone-700 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-700 disabled:opacity-50"
        >
          {loading ? "Verifying…" : "Verify now"}
        </button>
      </div>
    );
  }

  const pass = result.verified;

  return (
    <div>
      <div
        role="status"
        className={`border px-5 py-4 flex items-center gap-3 ${
          pass ? "border-stone-300 bg-stone-50" : "border-red-300 bg-red-50"
        }`}
      >
        <span aria-hidden="true" className={`text-lg ${pass ? "text-stone-700" : "text-red-700"}`}>
          {pass ? "✓" : "✗"}
        </span>
        <p className={`text-sm ${pass ? "text-stone-800" : "text-red-800"}`}>
          <span className="font-medium">{pass ? "Sealed and intact." : "Integrity check failed."}</span>{" "}
          <span className={pass ? "text-stone-600" : "text-red-700"}>{result.message}</span>
        </p>
      </div>

      <div className="mt-8 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-[0.15em] text-stone-400">Seal details</p>
        <button
          onClick={verifyNow}
          disabled={loading}
          className="text-sm text-stone-700 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-700 disabled:opacity-50"
        >
          {loading ? "Verifying…" : "Verify now"}
        </button>
      </div>

      <dl className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
        {[
          ["Verified", pass ? "Yes" : "No"],
          ["Chain sequence", result.chain_sequence ?? "—"],
          ["Record hash", result.record_hash ?? "—"],
          ["Previous hash", result.previous_hash ?? "—"],
          ["Sealed at", result.sealed_at ?? "—"],
          ["Chain status", result.chain_status],
        ].map(([k, v]) => (
          <div key={k} className="py-3 flex gap-6">
            <dt className="w-36 shrink-0 text-xs text-stone-400 pt-0.5">{k}</dt>
            <dd className="min-w-0 text-sm text-stone-800 break-all font-mono">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
