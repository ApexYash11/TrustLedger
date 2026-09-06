"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sidebar — fixed left navigation in the calm editorial style:
 * serif wordmark, hairline divider, uppercase section label,
 * active item marked by a text color shift (no chips or pills).
 */
const NAV_ITEMS = [
  { href: "/", label: "Command Center" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-stone-200 bg-[#f4f2ee] min-h-screen flex flex-col">
      <div className="px-6 pt-8 pb-6">
        <Link href="/" className="font-serif italic text-xl text-stone-900 tracking-tight">
          Trust<span className="not-italic">Ledger</span>
        </Link>
        <p className="text-[11px] uppercase tracking-[0.15em] text-stone-400 mt-2 leading-relaxed">
          Tamper-evident audit layer
        </p>
      </div>

      <nav className="border-t border-stone-200 pt-5 px-3 flex-1">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400 px-3 mb-2">
          Navigation
        </p>
        <ul>
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block px-3 py-2 text-sm transition-colors ${
                    active
                      ? "text-stone-900 border-l-2 border-stone-900 -ml-px"
                      : "text-stone-500 hover:text-stone-900 border-l-2 border-transparent -ml-px"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-6 py-6 border-t border-stone-200">
        <p className="text-[11px] text-stone-400 leading-relaxed">
          Every recommendation recorded, replayable, and verifiable.
        </p>
      </div>
    </aside>
  );
}
