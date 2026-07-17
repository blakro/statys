"use client";

import { useEffect, useMemo, useState } from "react";
import { Dataset } from "@/lib/dataset";
import { buildCrosstab, MAX_CROSS_MODALITIES } from "@/lib/bivariate-prep";
import { ApiError, CategoricalCategoricalResult, fetchCategoricalCategorical } from "@/lib/api";
import { PlotlyChart } from "@/components/PlotlyChart";
import { ErrorNotice, fmt, fmtP, InterpretationCard, LoadingNotice, numberFr } from "./common";

type TableView = "observed" | "expected" | "residuals";

/** Qualitatif × qualitatif : contingence, Khi-deux / Fisher, V de Cramér, résidus. */
export function CategoricalCategorical({
  dataset,
  xName,
  yName,
}: {
  dataset: Dataset;
  xName: string;
  yName: string;
}) {
  const crosstab = useMemo(() => buildCrosstab(dataset, xName, yName), [dataset, xName, yName]);
  const [result, setResult] = useState<CategoricalCategoricalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TableView>("observed");
  const [stacked, setStacked] = useState(true);

  useEffect(() => {
    if (crosstab.tooManyModalities || crosstab.rowLabels.length < 2 || crosstab.colLabels.length < 2)
      return;
    let cancelled = false;
    setResult(null);
    setError(null);
    fetchCategoricalCategorical(
      crosstab.observed,
      crosstab.rowLabels,
      crosstab.colLabels,
      `${dataset.fileName}|${xName}|${yName}`
    )
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Erreur inattendue."));
    return () => {
      cancelled = true;
    };
  }, [dataset.fileName, xName, yName, crosstab]);

  if (crosstab.tooManyModalities) {
    return (
      <ErrorNotice
        message={`Une des deux variables dépasse ${MAX_CROSS_MODALITIES} modalités : le croisement ne serait pas interprétable. Regroupez d'abord les modalités rares.`}
      />
    );
  }
  if (crosstab.rowLabels.length < 2 || crosstab.colLabels.length < 2) {
    return (
      <ErrorNotice message="Chaque variable doit avoir au moins deux modalités non manquantes pour tester l'indépendance." />
    );
  }
  if (error) return <ErrorNotice message={error} />;
  if (!result) return <LoadingNotice />;

  const cells: number[][] =
    view === "observed" ? crosstab.observed : view === "expected" ? result.expected : result.residuals;

  return (
    <div className="space-y-6">
      <InterpretationCard text={result.interpretation} />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Diagramme en barres bivarié */}
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-950">Répartition croisée</h3>
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
              <button
                className={`rounded-md px-2.5 py-1 ${stacked ? "bg-navy-800 text-white" : "text-slate-600"}`}
                onClick={() => setStacked(true)}
              >
                Empilé
              </button>
              <button
                className={`rounded-md px-2.5 py-1 ${!stacked ? "bg-navy-800 text-white" : "text-slate-600"}`}
                onClick={() => setStacked(false)}
              >
                Groupé
              </button>
            </div>
          </div>
          <div className="h-96">
            <PlotlyChart
              ariaLabel={`Diagramme en barres ${xName} × ${yName}`}
              data={crosstab.colLabels.map((col, j) => ({
                type: "bar",
                name: col,
                x: crosstab.rowLabels,
                y: crosstab.observed.map((row) => row[j]),
              }))}
              layout={{
                barmode: stacked ? "stack" : "group",
                xaxis: { title: { text: xName }, automargin: true },
                yaxis: { title: { text: "Effectif" } },
                legend: { orientation: "h", y: -0.25, title: { text: yName } },
              }}
            />
          </div>
        </div>

        {/* Résultat du test */}
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-navy-950">Test d&apos;indépendance</h3>
          <div className="rounded-lg border border-navy-200 bg-navy-50 px-4 py-3">
            <div className="font-medium text-navy-900">{result.test.name}</div>
            {result.test.reason && (
              <div className="mt-0.5 text-xs text-navy-700">
                Bascule automatique : {result.test.reason}
              </div>
            )}
            <div className="mt-1 text-sm text-navy-800">
              {result.test.statistic_label} ={" "}
              <span className="tabular-nums">{fmt(result.test.statistic)}</span>
              {result.test.df !== null && (
                <>
                  {" "}— ddl = <span className="tabular-nums">{result.test.df}</span>
                </>
              )}{" "}
              — p = <span className="tabular-nums font-semibold">{fmtP(result.test.pvalue)}</span>
            </div>
            <div className="mt-2 text-sm text-navy-800">
              V de Cramér = <span className="tabular-nums font-semibold">{fmt(result.cramer_v)}</span>{" "}
              <span className="badge ml-1 bg-white text-navy-700">{result.cramer_v_magnitude}</span>
            </div>
          </div>
          {result.test.warning && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {result.test.warning}
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Effectif total (test)</dt>
              <dd className="font-medium tabular-nums text-navy-950">
                {numberFr.format(crosstab.total)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Attendu minimal</dt>
              <dd className="font-medium tabular-nums text-navy-950">{fmt(result.min_expected)}</dd>
            </div>
          </dl>
          {crosstab.excluded > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {numberFr.format(crosstab.excluded)} lignes exclues (valeur manquante sur l&apos;une
              des deux variables).
            </p>
          )}
        </div>
      </div>

      {/* Tableau de contingence */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-navy-950">Tableau de contingence</h3>
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
            {(
              [
                ["observed", "Observés"],
                ["expected", "Attendus"],
                ["residuals", "Résidus standardisés"],
              ] as [TableView, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={`rounded-md px-2.5 py-1 ${view === key ? "bg-navy-800 text-white" : "text-slate-600"}`}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {view === "residuals" && (
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            Résidus standardisés ajustés : |résidu| &gt; 2 (en couleur) signale une combinaison qui
            porte l&apos;association — positif = sur-représentée, négatif = sous-représentée.
          </p>
        )}
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {xName} \ {yName}
                </th>
                {crosstab.colLabels.map((c) => (
                  <th key={c} scope="col" className="px-4 py-2 text-right font-medium">
                    {c}
                  </th>
                ))}
                {view === "observed" && (
                  <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {crosstab.rowLabels.map((rowLabel, i) => (
                <tr key={rowLabel}>
                  <td className="max-w-[160px] truncate px-4 py-2 font-medium text-navy-950" title={rowLabel}>
                    {rowLabel}
                  </td>
                  {crosstab.colLabels.map((_, j) => {
                    const v = cells[i][j];
                    const strong = view === "residuals" && Math.abs(v) > 2;
                    return (
                      <td
                        key={j}
                        className={`px-4 py-2 text-right tabular-nums ${
                          strong
                            ? v > 0
                              ? "bg-navy-50 font-semibold text-navy-800"
                              : "bg-amber-50 font-semibold text-amber-800"
                            : ""
                        }`}
                      >
                        {view === "observed" ? numberFr.format(v) : fmt(v)}
                      </td>
                    );
                  })}
                  {view === "observed" && (
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-600">
                      {numberFr.format(crosstab.observed[i].reduce((a, b) => a + b, 0))}
                    </td>
                  )}
                </tr>
              ))}
              {view === "observed" && (
                <tr className="bg-slate-50 font-medium">
                  <td className="px-4 py-2">Total</td>
                  {crosstab.colLabels.map((_, j) => (
                    <td key={j} className="px-4 py-2 text-right tabular-nums">
                      {numberFr.format(crosstab.observed.reduce((a, row) => a + row[j], 0))}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">
                    {numberFr.format(crosstab.total)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
