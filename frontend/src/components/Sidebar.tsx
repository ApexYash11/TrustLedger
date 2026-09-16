"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="flex w-[198px] shrink-0 flex-col gap-[5px] px-3.5 py-3.5 max-md:hidden">
      <Link
        href="/"
        title="TrustLedger"
        className="flex items-center gap-3 px-1 pt-1 pb-2.5 no-underline justify-start"
      >
        <span className="flex size-10 shrink-0 items-center justify-center text-text">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <rect x="6" y="6" width="20" height="20" rx="5.5" />
            <rect x="6" y="15.5" width="20" height="2.5" rx="1.25" fill="currentColor" stroke="none" />
            <path d="M11.5 10.5h3.5M11.5 21.5h7" />
          </svg>
        </span>
        <span className="text-[17px] font-semibold tracking-[-.3px] text-text">TrustLedger</span>
      </Link>
    </aside>
  );
}
