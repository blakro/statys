"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/donnees", label: "1. Données" },
  { href: "/app/univariee", label: "2. Analyse univariée" },
  { href: "/app/bivariee", label: "3. Analyse bivariée" },
  { href: "/app/rapport", label: "4. Rapport" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Étapes d'analyse">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "border-white text-white"
                    : "border-transparent text-navy-300 hover:border-navy-500 hover:text-white"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
