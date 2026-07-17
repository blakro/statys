"use client";

import { useEffect, useMemo, useState } from "react";
import { Dataset } from "@/lib/dataset";
import { useSession } from "@/lib/store";
import { convertColumn } from "@/lib/detect";
import { ApiError, CorrelationMatrixResult, fetchCorrelationMatrix } from "@/lib/api";
import { PlotlyChart } from "@/components/PlotlyChart";
import { ErrorNotice, LoadingNotice } from "./common";

const METHODS = [
  ["pearson", "Pearson"],
  ["spearman", "Spearman"],
  ["kendall", "Kendall"],
] as const;

/** Matrice de corrélation pour ≥ 3 variables quantitatives (heatmap). */
export function CorrelationMatrix({ dataset }: { dataset: Dataset }) {
  const decimal = useSession((s) => s.importOptions.decimalSeparator);
  const numericColumns = dataset.columns.filter((c) => c.type === "numeric").map((c) => c.name);
  const [selected, setSelected] = useState<string[]>(numericColumns.slice(0, 6));
  const [method, setMethod] = useState<string>("pearson");
  const [result, setResult] = useState<CorrelationMatrixResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected.length < 2) return;
    let cancelled = false;
    setResult(null);
    setError(null);
    const columns: Record<string, (number | null)[]> = {};
    for (const name of selected) {
      const i = dataset.columns.findIndex((c) => c.name === name);
      columns[name] = convertColumn(dataset.rows, i, "numeric", decimal).map((v) =>
        typeof v === "number" && Number.isFinite(v) ? v : null
      );
    }
    fetchCorrelationMatrix(
      columns,
      method,
      `${dataset.fileName}|${selected.join(",")}|${decimal}`
    )
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Erreur inattendue."));
    return () => {
      cancelled = true;
    };
  }, [dataset, selected, method, decimal]);

  const annotations = useMemo(() => {
    if (!result) return [];
    return result.variables.flatMap((_, i) =>
      result.variables.map((_, j) => ({
        x: result.variables[j],
        y: result.variables[i],
        text: Number.isNaN(result.matrix[i][j])
          ? "—"
          : result.matrix[i][j].toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
        showarrow: false,
        font: { color: Math.abs(result.matrix[i][j]) > 0.6 ? "#ffffff" : "#0f1c2e", size: 11 },
      }))
    );
  }, [result]);

  // Alimente le journal du rapport PDF (une section par méthode).
  const addReportEntry = useSession((s) => s.addReportEntry);
  useEffect(() => {
    if (!result) return;
    const methodLabel = METHODS.find(([k]) => k === result.method)?.[1] ?? result.method;
    addReportEntry({
      id: `cm:${result.method}`,
      kind: "correlation-matrix",
      title: `Matrice de corrélation (${methodLabel})`,
      subtitle: `${result.variables.length} variables — paires complètes deux à deux`,
      interpretation: "",
      figures: [
        {
          title: `Corrélations de ${methodLabel}`,
          data: [
            {
              type: "heatmap",
              x: result.variables,
              y: result.variables,
              z: result.matrix,
              zmin: -1,
              zmax: 1,
              colorscale: [
                [0, "#b45309"],
                [0.5, "#f6f7f9"],
                [1, "#233354"],
              ],
              colorbar: { title: { text: "r" } },
            },
          ],
          layout: {
            annotations: annotations as never,
            xaxis: { automargin: true },
            yaxis: { automargin: true, autorange: "reversed" },
          },
        },
      ],
      tables: [],
      createdAt: Date.now(),
    });
  }, [result, annotations, addReportEntry]);

  function toggle(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  if (numericColumns.length < 3) {
    return (
      <ErrorNotice message="La matrice de corrélation demande au moins trois variables quantitatives dans le jeu de données." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-4">
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">
            Variables quantitatives à croiser ({selected.length} sélectionnées, 20 max)
          </div>
          <div className="flex flex-wrap gap-2">
            {numericColumns.map((name) => {
              const active = selected.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => toggle(name)}
                  disabled={!active && selected.length >= 20}
                  aria-pressed={active}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-navy-700 bg-navy-800 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-navy-400"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Méthode :</span>
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
            {METHODS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMethod(key)}
                className={`rounded-md px-2.5 py-1 ${method === key ? "bg-navy-800 text-white" : "text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected.length < 2 && (
        <p className="text-sm text-slate-500">Sélectionnez au moins deux variables.</p>
      )}
      {error && <ErrorNotice message={error} />}
      {selected.length >= 2 && !error && !result && <LoadingNotice />}

      {result && (
        <div className="card p-4">
          <div className="h-[480px]">
            <PlotlyChart
              ariaLabel="Matrice de corrélation"
              data={[
                {
                  type: "heatmap",
                  x: result.variables,
                  y: result.variables,
                  z: result.matrix,
                  zmin: -1,
                  zmax: 1,
                  colorscale: [
                    [0, "#b45309"],
                    [0.5, "#f6f7f9"],
                    [1, "#233354"],
                  ],
                  colorbar: { title: { text: "r" } },
                },
              ]}
              layout={{
                annotations,
                xaxis: { automargin: true },
                yaxis: { automargin: true, autorange: "reversed" },
                margin: { l: 8, r: 8, t: 8, b: 8 },
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Corrélations calculées sur les paires complètes deux à deux (méthode :{" "}
            {METHODS.find(([k]) => k === result.method)?.[1]}).
          </p>
        </div>
      )}
    </div>
  );
}
