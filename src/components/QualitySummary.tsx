"use client";

import { useMemo } from "react";
import { computeQuality } from "@/lib/quality";
import { useSession } from "@/lib/store";

const numberFr = new Intl.NumberFormat("fr-FR");

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-navy-950">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Cartes de synthèse : dimensions, doublons, valeurs manquantes. */
export function QualitySummary() {
  const dataset = useSession((s) => s.dataset);
  const report = useMemo(() => (dataset ? computeQuality(dataset) : null), [dataset]);
  if (!report) return null;

  const missingPct =
    report.rowCount * report.columnCount > 0
      ? (report.totalMissing / (report.rowCount * report.columnCount)) * 100
      : 0;

  return (
    <section aria-label="Qualité des données" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Lignes" value={numberFr.format(report.rowCount)} />
      <StatCard label="Colonnes" value={numberFr.format(report.columnCount)} />
      <StatCard
        label="Lignes dupliquées"
        value={numberFr.format(report.duplicateRows)}
        hint={report.duplicateRows > 0 ? "À examiner avant analyse" : "Aucun doublon détecté"}
      />
      <StatCard
        label="Valeurs manquantes"
        value={numberFr.format(report.totalMissing)}
        hint={`${missingPct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des cellules`}
      />
    </section>
  );
}
