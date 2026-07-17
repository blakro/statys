"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/store";

const TABS = [
  { href: "/app/donnees", label: "1. Données" },
  { href: "/app/univariee", label: "2. Analyse univariée" },
  { href: "/app/bivariee", label: "3. Analyse bivariée" },
  { href: "/app/rapport", label: "4. Rapport" },
];

export function AppNav() {
  const pathname = usePathname();
  const hasDataset = useSession((s) => s.dataset !== null);
  const reportCount = useSession((s) => s.reportEntries.length);

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
                className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 ${
                  active
                    ? "border-white text-white"
                    : "border-transparent text-navy-300 hover:border-navy-500 hover:text-white"
                }`}
              >
                {tab.label}
                {tab.href === "/app/donnees" && hasDataset && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                    title="Jeu de données chargé"
                    aria-label="Jeu de données chargé"
                  />
                )}
                {tab.href === "/app/rapport" && reportCount > 0 && (
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-navy-700 px-1.5 text-xs tabular-nums text-navy-100"
                    aria-label={`${reportCount} section${reportCount > 1 ? "s" : ""} prête${reportCount > 1 ? "s" : ""} pour le rapport`}
                  >
                    {reportCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
