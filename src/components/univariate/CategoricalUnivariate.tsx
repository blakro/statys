"use client";

import { useMemo } from "react";
import { Dataset, isMissing } from "@/lib/dataset";
import { PlotlyChart } from "@/components/PlotlyChart";

const numberFr = new Intl.NumberFormat("fr-FR");
const pctFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const MISSING_LABEL = "(manquant)";
/** Règle du brief : < 4 modalités → camembert ; ≥ 4 → barplot trié décroissant. */
const PIE_MAX_CATEGORIES = 4;
/** Au-delà, le barplot regroupe la traîne dans « Autres » pour rester lisible. */
const MAX_BARS = 30;

interface FrequencyRow {
  label: string;
  count: number;
  pct: number;
  cumulativePct: number;
  isMissing: boolean;
}

/** Analyse univariée d'une variable qualitative — calcul entièrement côté navigateur. */
export function CategoricalUnivariate({
  dataset,
  columnName,
}: {
  dataset: Dataset;
  columnName: string;
}) {
  const colIndex = dataset.columns.findIndex((c) => c.name === columnName);

  const rows = useMemo<FrequencyRow[]>(() => {
    const counts = new Map<string, number>();
    let missing = 0;
    for (const row of dataset.rows) {
      const v = row[colIndex] ?? null;
      if (isMissing(v)) {
        missing++;
      } else {
        const label = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }

    const total = dataset.rows.length;
    // Tri par fréquence décroissante ; les manquantes forment une catégorie à part, en fin.
    const sorted: FrequencyRow[] = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        count,
        pct: (count / total) * 100,
        cumulativePct: 0,
        isMissing: false,
      }));
    if (missing > 0) {
      sorted.push({
        label: MISSING_LABEL,
        count: missing,
        pct: (missing / total) * 100,
        cumulativePct: 0,
        isMissing: true,
      });
    }
    let cumulative = 0;
    for (const r of sorted) {
      cumulative += r.pct;
      r.cumulativePct = cumulative;
    }
    return sorted;
  }, [dataset, colIndex]);

  const usePie = rows.length < PIE_MAX_CATEGORIES;

  const barRows = useMemo(() => {
    if (rows.length <= MAX_BARS) return rows;
    const kept = rows.slice(0, MAX_BARS - 1);
    const rest = rows.slice(MAX_BARS - 1);
    return [
      ...kept,
      {
        label: `Autres (${numberFr.format(rest.length)} modalités)`,
        count: rest.reduce((a, r) => a + r.count, 0),
        pct: rest.reduce((a, r) => a + r.pct, 0),
        cumulativePct: 100,
        isMissing: false,
      },
    ];
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Aucune valeur dans cette colonne.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-navy-950">
            {usePie ? "Répartition (camembert)" : "Répartition (barres, tri décroissant)"}
          </h3>
          <div className="h-96">
            {usePie ? (
              <PlotlyChart
                ariaLabel={`Camembert de ${columnName}`}
                data={[
                  {
                    type: "pie",
                    labels: rows.map((r) => r.label),
                    values: rows.map((r) => r.count),
                    textinfo: "label+percent",
                    hole: 0.35,
                    sort: true,
                  },
                ]}
                layout={{ legend: { orientation: "h", y: -0.1 } }}
              />
            ) : (
              <PlotlyChart
                ariaLabel={`Diagramme en barres de ${columnName}`}
                data={[
                  {
                    type: "bar",
                    x: barRows.map((r) => r.count),
                    y: barRows.map((r) => r.label),
                    orientation: "h",
                    marker: {
                      color: barRows.map((r) => (r.isMissing ? "#cbd5e1" : "#315493")),
                    },
                  },
                ]}
                layout={{
                  xaxis: { title: { text: "Effectif" } },
                  yaxis: { autorange: "reversed", automargin: true },
                  margin: { l: 140 },
                }}
              />
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-navy-950">
              Tableau de fréquences ({numberFr.format(rows.length)} modalités)
            </h3>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Modalité</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Effectif</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Fréquence</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Cumulée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.label} className={r.isMissing ? "bg-slate-50 italic" : ""}>
                    <td className="max-w-[160px] truncate px-4 py-1.5" title={r.label}>
                      {r.label}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {numberFr.format(r.count)}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {pctFr.format(r.pct)} %
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-slate-500">
                      {pctFr.format(r.cumulativePct)} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
