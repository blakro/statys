"use client";

import { useMemo } from "react";
import { COLUMN_TYPE_LABELS, ColumnType } from "@/lib/dataset";
import { computeQuality } from "@/lib/quality";
import { useSession } from "@/lib/store";

const TYPE_BADGE_STYLES: Record<ColumnType, string> = {
  numeric: "bg-blue-50 text-blue-700",
  categorical: "bg-amber-50 text-amber-700",
  date: "bg-emerald-50 text-emerald-700",
  text: "bg-slate-100 text-slate-600",
};

const numberFr = new Intl.NumberFormat("fr-FR");

/**
 * Schéma des colonnes : type détecté + conversion manuelle (l'utilisateur peut
 * forcer un type, ex. un code 0/1 détecté « numérique » → « catégorielle »).
 */
export function ColumnSchemaTable() {
  const { dataset, setColumnType } = useSession();
  const report = useMemo(() => (dataset ? computeQuality(dataset) : null), [dataset]);
  if (!dataset || !report) return null;

  return (
    <section className="card overflow-hidden" aria-label="Schéma des colonnes">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-navy-950">Variables ({dataset.columns.length})</h2>
        <p className="text-xs text-slate-500">
          Le type détecté peut être corrigé — il détermine les analyses proposées ensuite.
        </p>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Variable</th>
              <th scope="col" className="px-4 py-2 font-medium">Type</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Manquantes</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Modalités</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dataset.columns.map((col, i) => {
              const q = report.columns[i];
              const overridden = col.type !== col.detectedType;
              return (
                <tr key={col.name} className="hover:bg-slate-50">
                  <td className="max-w-[180px] truncate px-4 py-2 font-medium text-navy-950" title={col.name}>
                    {col.name}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Type de la variable ${col.name}`}
                        className={`badge cursor-pointer border-0 ${TYPE_BADGE_STYLES[col.type]}`}
                        value={col.type}
                        onChange={(e) => setColumnType(i, e.target.value as ColumnType)}
                      >
                        {(Object.keys(COLUMN_TYPE_LABELS) as ColumnType[]).map((t) => (
                          <option key={t} value={t}>
                            {COLUMN_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      {overridden && (
                        <span
                          className="text-xs text-slate-500"
                          title={`Type détecté : ${COLUMN_TYPE_LABELS[col.detectedType]}`}
                        >
                          modifié
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {q.missing > 0 ? (
                      <span className={q.missingPct > 20 ? "font-medium text-red-600" : ""}>
                        {numberFr.format(q.missing)}{" "}
                        <span className="text-xs text-slate-500">
                          ({q.missingPct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {numberFr.format(q.distinct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
