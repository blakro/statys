"use client";

import { useEffect, useMemo, useState } from "react";
import { Dataset } from "@/lib/dataset";
import { useSession } from "@/lib/store";
import { extractNumericPair } from "@/lib/bivariate-prep";
import { ApiError, fetchNumericNumeric, NumericNumericResult } from "@/lib/api";
import { PlotlyChart } from "@/components/PlotlyChart";
import {
  ErrorNotice,
  fmt,
  fmtP,
  InterpretationCard,
  LoadingNotice,
  numberFr,
  SignificanceBadge,
} from "./common";

/** Quantitatif × quantitatif : nuage + régression, trois corrélations avec IC. */
export function NumericNumeric({
  dataset,
  xName,
  yName,
}: {
  dataset: Dataset;
  xName: string;
  yName: string;
}) {
  const decimal = useSession((s) => s.importOptions.decimalSeparator);
  const { x, y } = useMemo(
    () => extractNumericPair(dataset, xName, yName, decimal),
    [dataset, xName, yName, decimal]
  );

  const [result, setResult] = useState<NumericNumericResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    fetchNumericNumeric(x, y, `${dataset.fileName}|${xName}|${yName}|${decimal}`)
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Erreur inattendue."));
    return () => {
      cancelled = true;
    };
  }, [dataset.fileName, xName, yName, x, y, decimal]);

  const points = useMemo(() => {
    const px: number[] = [];
    const py: number[] = [];
    for (let i = 0; i < x.length; i++) {
      if (x[i] !== null && y[i] !== null) {
        px.push(x[i] as number);
        py.push(y[i] as number);
      }
    }
    return { px, py };
  }, [x, y]);

  if (error) return <ErrorNotice message={error} />;
  if (!result) return <LoadingNotice />;

  const { regression } = result;
  const xMin = Math.min(...points.px);
  const xMax = Math.max(...points.px);

  const rows: { label: string; entry: NumericNumericResult["pearson"] }[] = [
    { label: "Pearson (linéaire)", entry: result.pearson },
    { label: "Spearman (monotone, rangs)", entry: result.spearman },
    { label: "Kendall (τ, rangs)", entry: result.kendall },
  ];

  return (
    <div className="space-y-6">
      <InterpretationCard text={result.interpretation} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-navy-950">
            Nuage de points et droite de régression
          </h3>
          <div className="h-96">
            <PlotlyChart
              ariaLabel={`Nuage de points ${xName} × ${yName}`}
              data={[
                {
                  type: "scattergl",
                  mode: "markers",
                  x: points.px,
                  y: points.py,
                  name: "Observations",
                  marker: { size: 5, opacity: 0.55 },
                },
                {
                  type: "scatter",
                  mode: "lines",
                  x: [xMin, xMax],
                  y: [
                    regression.slope * xMin + regression.intercept,
                    regression.slope * xMax + regression.intercept,
                  ],
                  name: `Régression (R² = ${fmt(regression.r_squared)})`,
                  line: { color: "#b45309", width: 2 },
                },
              ]}
              layout={{
                xaxis: { title: { text: xName } },
                yaxis: { title: { text: yName } },
                legend: { orientation: "h", y: -0.2 },
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            y = {fmt(regression.slope)} × x {regression.intercept >= 0 ? "+" : "−"}{" "}
            {fmt(Math.abs(regression.intercept))} — {numberFr.format(result.n)} paires complètes
            {result.excluded > 0 && `, ${numberFr.format(result.excluded)} lignes exclues`}
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-navy-950">Coefficients de corrélation</h3>
            <p className="text-xs text-slate-500">
              Chaque coefficient avec sa p-value et son intervalle de confiance à 95 %.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Coefficient</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">r</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">p-value</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">IC 95 %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ label, entry }) => (
                <tr key={label}>
                  <td className="px-4 py-2.5">{label}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-navy-950">
                    {fmt(entry.r)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtP(entry.pvalue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {entry.ci95 ? `[${fmt(entry.ci95[0])} ; ${fmt(entry.ci95[1])}]` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-3">
            <SignificanceBadge pvalue={result.pearson.pvalue} />
          </div>
        </div>
      </div>
    </div>
  );
}
