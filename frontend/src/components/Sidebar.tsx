"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Board", href: "/" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-52 shrink-0 flex-col border-r border-stone-200 bg-stone-50 p-3">
      <div className="mb-6 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-900 text-[11px] font-bold text-white">
          TL
        </div>
        <div>
          <span className="block text-sm font-semibold tracking-tight text-stone-900">TrustLedger</span>
          <span className="block text-[10px] font-medium tracking-widest text-stone-400">AUDIT LAYER</span>
        </div>
      </div>
      <p className="mb-4 rounded-md bg-white px-2.5 py-2 text-[11px] leading-relaxed text-stone-500 shadow-sm">
        AI decides.<br /><span className="font-medium text-stone-700">TrustLedger records &amp; verifies.</span>
      </p>

      <nav className="space-y-0.5">
        {NAV.map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              pathname === href
                ? "bg-stone-200/70 font-medium text-stone-900"
                : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

