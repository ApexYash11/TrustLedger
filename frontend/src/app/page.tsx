import Link from "next/link";

/**
 * TrustLedger entry screen.
 *
 * The Kanban board lives at /command-center; this page is a quiet introduction
 * to what the system does. Built entirely from the existing design tokens —
 * same type, borders, radii, and ink/surface palette — with no new dependencies.
 */

const FLOW = ["Research", "Evidence", "Reasoning", "Human Review", "Verified Decision"];

const STEPS = [
  {
    n: "01",
    title: "Research",
    body: "A decision question enters TrustLedger.",
  },
  {
    n: "02",
    title: "Evidence",
    body: "Supporting evidence and methodology are captured.",
  },
  {
    n: "03",
    title: "Review",
    body: "A human can review the resulting recommendation.",
  },
  {
    n: "04",
    title: "Verify",
    body: "The final decision is recorded with its audit trail and integrity information.",
  },
];

function Logo() {
  return (
    <span className="flex items-center gap-3 no-underline">
      <span className="flex size-10 items-center justify-center text-text">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <rect x="6" y="6" width="20" height="20" rx="5.5" />
          <rect x="6" y="15.5" width="20" height="2.5" rx="1.25" fill="currentColor" stroke="none" />
          <path d="M11.5 10.5h3.5M11.5 21.5h7" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-[-.3px] text-text">TrustLedger</span>
    </span>
  );
}

export default function IntroPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="flex items-center px-5 pt-4 md:px-8">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-14">
        {/* Thesis */}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Decision audit &amp; trust layer</p>
        <h1 className="mt-3 text-[34px] font-bold leading-[1.1] tracking-tight text-text md:text-[44px]">
          Evidence-backed decisions.
          <br />
          Built to be trusted.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-text-2">
          An AI-powered decision research system that turns complex questions into evidence,
          reasoning, and auditable decisions.
        </p>

        {/* Flow */}
        <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2.5">
          {FLOW.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted" aria-hidden>→</span>}
              <span className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-text-2">
                {step}
              </span>
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10">
          <Link
            href="/command-center"
            className="inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ink-fg no-underline hover:brightness-95"
          >
            Enter Command Center →
          </Link>
        </div>

        {/* How it works */}
        <div className="mt-16">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">How it works</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-[14px] border border-border bg-surface p-5 shadow-card">
                <p className="font-mono text-[11px] font-medium text-muted">{s.n}</p>
                <p className="mt-2 text-[14px] font-semibold text-text">{s.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-5 py-4 md:px-8">
        <p className="text-xs text-muted">The agent decides. TrustLedger records and verifies.</p>
      </footer>
    </div>
  );
}
