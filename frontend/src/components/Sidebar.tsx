"use client";

import { usePathname } from "next/navigation";

const NAV = ["Home", "My Task", "Inbox", "Project", "Decisions", "Reports"];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-52 shrink-0 flex-col border-r border-stone-200 bg-stone-50 p-3">
      <div className="mb-6 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-900 text-[11px] font-bold text-white">
          TL
        </div>
        <span className="text-sm font-semibold tracking-tight text-stone-900">TrustLedger</span>
      </div>

      <nav className="space-y-0.5">
        {NAV.map((label) => (
          <a
            key={label}
            href={pathname}
            className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              label === "Decisions"
                ? "bg-stone-200/70 font-medium text-stone-900"
                : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
