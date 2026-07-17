"use client";

import { useMemo, useState } from "react";
import { isMissing } from "@/lib/dataset";
import { convertCell } from "@/lib/detect";
import { useSession } from "@/lib/store";

const PAGE_SIZE = 50;
const numberFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const dateFr = new Intl.DateTimeFormat("fr-FR");

/** Aperçu paginé du jeu de données — seules les lignes affichées sont rendues. */
export function DataPreview() {
  const { dataset, importOptions } = useSession();
  const [page, setPage] = useState(0);

  const pageCount = dataset ? Math.max(1, Math.ceil(dataset.rows.length / PAGE_SIZE)) : 1;
  const currentPage = Math.min(page, pageCount - 1);

  const pageRows = useMemo(() => {
    if (!dataset) return [];
    const start = currentPage * PAGE_SIZE;
    return dataset.rows.slice(start, start + PAGE_SIZE).map((row) =>
      dataset.columns.map((col, c) => {
        const raw = row[c] ?? null;
        if (isMissing(raw)) return null;
        const v = convertCell(raw, col.type, importOptions.decimalSeparator);
        if (v === null) return { invalid: true, display: String(raw) };
        if (typeof v === "number") return { invalid: false, display: numberFr.format(v) };
        if (v instanceof Date) return { invalid: false, display: dateFr.format(v) };
        return { invalid: false, display: v };
      })
    );
  }, [dataset, currentPage, importOptions.decimalSeparator]);

  if (!dataset) return null;

  const start = currentPage * PAGE_SIZE;

  return (
    <section className="card overflow-hidden" aria-label="Aperçu des données">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-950">Aperçu</h2>
          <p className="text-xs text-slate-500">
            Lignes {numberFr.format(start + 1)}–
            {numberFr.format(Math.min(start + PAGE_SIZE, dataset.rows.length))} sur{" "}
            {numberFr.format(dataset.rows.length)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost px-2.5 py-1.5"
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            aria-label="Page précédente"
          >
            ←
          </button>
          <span className="text-sm tabular-nums text-slate-600">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            className="btn-ghost px-2.5 py-1.5"
            onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
            disabled={currentPage >= pageCount - 1}
            aria-label="Page suivante"
          >
            →
          </button>
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium text-slate-400">#</th>
              {dataset.columns.map((col) => (
                <th key={col.name} scope="col" className="px-3 py-2 font-medium">
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row, r) => (
              <tr key={start + r} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 tabular-nums text-slate-400">{start + r + 1}</td>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-1.5 ${
                      cell === null
                        ? "text-slate-300"
                        : cell.invalid
                          ? "text-red-500"
                          : "text-slate-700"
                    }`}
                    title={cell?.invalid ? "Valeur non conforme au type de la colonne" : undefined}
                  >
                    {cell === null ? "∅" : cell.display}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
