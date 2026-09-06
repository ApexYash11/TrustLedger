"use client";

import { useCallback, useEffect, useState } from "react";
import { api, VerifyResponse } from "@/lib/api";
import { formatTimestamp, humanize } from "@/lib/format";

export default function IntegrityPanel({ taskId }: { taskId: string }) {
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const verify = useCallback(async () => {
    setIsVerifying(true);
    setError(null);
    try {
      setResult(await api.verifyDecision(taskId));
    } catch {
      setError("Unable to verify integrity. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  }, [taskId]);

  useEffect(() => {
    void verify();
  }, [verify]);

  if (error && !result) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!result) {
    return (
      <p className="rounded-lg border border-stone-200 p-5 text-sm text-stone-500">Checking integrity…</p>
    );
  }

  const passed = result.verified;
  const statusLabel = passed ? "PASS — Integrity Verified" : "FAIL — Integrity Check Failed";
  const description = passed
    ? "This decision passed integrity verification. Its stored record and hash-chain link match."
    : result.chain_status === "unsealed"
      ? "This decision has not been sealed on the hash chain yet."
      : "This decision failed integrity verification and may have been tampered with.";

  return (
    <section aria-live="polite">
      <div className={`rounded-lg border p-5 ${passed ? "border-stone-300 bg-stone-50" : "border-red-300 bg-red-50"}`}>
        <p className={`text-sm font-bold ${passed ? "text-stone-900" : "text-red-800"}`}>{statusLabel}</p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">{description}</p>
        <p className="mt-2 text-xs text-stone-600">Verification message: {result.message}</p>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-lg border border-stone-200 text-sm">
        <div className="border-b border-r border-stone-200 bg-stone-50 p-3">
          <dt className="text-stone-500">Sealed at</dt>
          <dd className="mt-1 font-medium text-stone-900">{formatTimestamp(result.sealed_at)}</dd>
        </div>
        <div className="border-b border-stone-200 bg-stone-50 p-3">
          <dt className="text-stone-500">Chain position</dt>
          <dd className="mt-1 font-medium text-stone-900">
            {result.chain_sequence == null ? "Not available" : `Record #${result.chain_sequence}`}
          </dd>
        </div>
        <div className="col-span-2 p-3">
          <dt className="text-stone-500">Chain status</dt>
          <dd className="mt-1 font-medium text-stone-900">{humanize(result.chain_status)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void verify()}
          disabled={isVerifying}
          className="rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVerifying ? "Verifying…" : "Verify Now"}
        </button>
        <button
          type="button"
          onClick={() => setShowDetails((visible) => !visible)}
          aria-expanded={showDetails}
          className="text-sm font-medium text-stone-700 underline underline-offset-2"
        >
          {showDetails ? "Hide technical details" : "Show technical details"}
        </button>
      </div>

      {showDetails && (
        <dl className="mt-4 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm">
          <div>
            <dt className="font-medium text-stone-700">Record hash</dt>
            <dd className="mt-1 break-all font-mono text-xs text-stone-600">
              {result.record_hash ?? "Not available"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-stone-700">Previous hash</dt>
            <dd className="mt-1 break-all font-mono text-xs text-stone-600">
              {result.previous_hash ?? "Not available"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-stone-700">Verification status</dt>
            <dd className="mt-1 text-stone-600">{humanize(result.chain_status)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

