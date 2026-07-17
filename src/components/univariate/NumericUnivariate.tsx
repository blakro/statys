"use client";

import { useEffect, useMemo, useState } from "react";
import { Dataset } from "@/lib/dataset";
import { convertColumn } from "@/lib/detect";
import { useSession } from "@/lib/store";
import {
  ApiError,
  fetchUnivariateNumeric,
  MAX_API_VALUES,
  UnivariateNumericResult,
} from "@/lib/api";
import { downsample, ReportFigure } from "@/lib/report";
import { PlotlyChart } from "@/components/PlotlyChart";
import { AnalysisSkeleton } from "@/components/Skeleton";

const numberFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return numberFr.format(v);
}

function fmtP(p: number): string {
  if (p < 0.001) return "< 0,001";
  return p.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-navy-950">{title}</h3>
      <div className="h-72">{children}</div>
    </div>
  );
}

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-1.5 pr-4 text-slate-600">{label}</td>
      <td className="py-1.5 text-right font-medium tabular-nums text-navy-950">{value}</td>
    </tr>
  );
}

/** Analyse univariée d'une variable quantitative. */
export function NumericUnivariate({ dataset, columnName }: { dataset: Dataset; columnName: string }) {
  const importOptions = useSession((s) => s.importOptions);
  const colIndex = dataset.columns.findIndex((c) => c.name === columnName);

  const values = useMemo(() => {
    const converted = convertColumn(dataset.rows, colIndex, "numeric", importOptions.decimalSeparator);
    return converted.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
  }, [dataset, colIndex, importOptions.decimalSeparator]);

  const numericValues = useMemo(() => values.filter((v): v is number => v !== null), [values]);

  const [result, setResult] = useState<UnivariateNumericResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bins, setBins] = useState(30);
  const [jitter, setJitter] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    const cacheKey = `${dataset.fileName}|${columnName}|${importOptions.decimalSeparator}|${values.length}`;
    fetchUnivariateNumeric(values, cacheKey)
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Erreur inattendue."));
    return () => {
      cancelled = true;
    };
  }, [dataset.fileName, columnName, values, importOptions.decimalSeparator]);

  // Alimente le journal du rapport PDF (remplacé si la variable est re-analysée).
  const addReportEntry = useSession((s) => s.addReportEntry);
  useEffect(() => {
    if (!result) return;
    const { stats, normality } = result;
    const figures: ReportFigure[] = [
      {
        title: "Histogramme",
        data: [{ type: "histogram", x: numericValues, nbinsx: 30, marker: { color: "#315493" } }],
        layout: {
          xaxis: { title: { text: columnName } },
          yaxis: { title: { text: "Effectif" } },
          bargap: 0.02,
        },
      },
      {
        title: "Boxplot",
        data: [
          {
            type: "box",
            x: downsample(numericValues, 20000),
            name: columnName,
            boxpoints: "outliers",
            boxmean: true,
            orientation: "h",
            marker: { color: "#315493" },
          },
        ],
        layout: { xaxis: { title: { text: columnName } }, yaxis: { showticklabels: false } },
      },
    ];
    if (result.qq) {
      const qq = result.qq;
      figures.push({
        title: "QQ-plot (vs loi normale)",
        data: [
          {
            type: "scatter",
            mode: "markers",
            x: qq.theoretical,
            y: qq.sample,
            name: "Quantiles observés",
            marker: { size: 5, opacity: 0.7, color: "#315493" },
          },
          {
            type: "scatter",
            mode: "lines",
            x: [qq.theoretical[0], qq.theoretical[qq.theoretical.length - 1]],
            y: [
              qq.slope * qq.theoretical[0] + qq.intercept,
              qq.slope * qq.theoretical[qq.theoretical.length - 1] + qq.intercept,
            ],
            name: `Droite de Henry (R² = ${fmt(qq.r_squared)})`,
            line: { color: "#b45309", width: 2, dash: "dash" },
          },
        ],
        layout: {
          xaxis: { title: { text: "Quantiles théoriques" } },
          yaxis: { title: { text: "Quantiles observés" } },
        },
      });
    }
    addReportEntry({
      id: `uni-num:${columnName}`,
      kind: "univariate-numeric",
      title: `Analyse univariée — ${columnName}`,
      subtitle: `Variable quantitative — ${numberFr.format(stats.n)} valeurs analysées${
        result.excluded > 0 ? `, ${numberFr.format(result.excluded)} exclues` : ""
      }`,
      interpretation: result.interpretation,
      figures,
      tables: [
        {
          title: "Statistiques descriptives",
          columns: ["Indicateur", "Valeur"],
          rows: [
            ["Moyenne", fmt(stats.central.mean)],
            ["Médiane", fmt(stats.central.median)],
            ["Mode", fmt(stats.central.mode)],
            ["Écart-type", fmt(stats.dispersion.std)],
            ["Variance", fmt(stats.dispersion.variance)],
            ["Écart interquartile (IQR)", fmt(stats.dispersion.iqr)],
            ["Étendue", fmt(stats.dispersion.range)],
            ["Coefficient de variation", fmt(stats.dispersion.cv)],
            ["Minimum", fmt(stats.position.min)],
            ["P10", fmt(stats.position.p10)],
            ["Q1", fmt(stats.position.q1)],
            ["Q3", fmt(stats.position.q3)],
            ["P90", fmt(stats.position.p90)],
            ["Maximum", fmt(stats.position.max)],
            ["Asymétrie (skewness)", fmt(stats.position.skewness)],
            ["Aplatissement (kurtosis)", fmt(stats.position.kurtosis)],
          ],
        },
        ...(normality
          ? [
              {
                title: "Test de normalité",
                columns: ["Test", "Statistique", "p-value", "Conclusion"],
                rows: [
                  [
                    normality.test,
                    fmt(normality.statistic),
                    fmtP(normality.pvalue),
                    normality.normal
                      ? "compatible avec la loi normale"
                      : "s'écarte de la loi normale",
                  ],
                ],
              },
            ]
          : []),
      ],
      createdAt: Date.now(),
    });
  }, [result, columnName, numericValues, addReportEntry]);

  const jitterAmplitude = useMemo(() => {
    if (!jitter || result === null) return 0;
    const iqr = result.stats.dispersion.iqr;
    return iqr > 0 ? iqr * 0.05 : result.stats.dispersion.std * 0.05;
  }, [jitter, result]);

  const indexScatterY = useMemo(() => {
    if (jitterAmplitude === 0) return numericValues;
    return numericValues.map((v) => v + (Math.random() - 0.5) * 2 * jitterAmplitude);
  }, [numericValues, jitterAmplitude]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!result) {
    return <AnalysisSkeleton />;
  }

  const { stats, normality, qq } = result;

  return (
    <div className="space-y-6">
      {values.length > MAX_API_VALUES && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Colonne volumineuse : les statistiques portent sur les {numberFr.format(MAX_API_VALUES)}{" "}
          premières valeurs.
        </p>
      )}

      {/* Interprétation automatique + test de normalité */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge ${
              normality === null
                ? "bg-slate-100 text-slate-600"
                : normality.normal
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {normality === null
              ? "Normalité non testable"
              : normality.normal
                ? "Compatible avec la loi normale"
                : "Non normale"}
          </span>
          {normality && (
            <span className="text-xs text-slate-500">
              {normality.test} ({normality.reason}) — statistique ={" "}
              {fmt(normality.statistic)}, p = {fmtP(normality.pvalue)}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-700">{result.interpretation}</p>
        <p className="mt-1 text-xs text-slate-500">
          {numberFr.format(stats.n)} valeurs analysées
          {result.excluded > 0 &&
            ` — ${numberFr.format(result.excluded)} manquantes ou non numériques exclues`}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Histogramme">
          <div className="flex h-full flex-col">
            <label className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              Classes : <span className="font-medium tabular-nums">{bins}</span>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={bins}
                onChange={(e) => setBins(Number(e.target.value))}
                className="w-40 accent-navy-700"
                aria-label="Nombre de classes de l'histogramme"
              />
            </label>
            <div className="min-h-0 flex-1">
              <PlotlyChart
                ariaLabel={`Histogramme de ${columnName}`}
                data={[{ type: "histogram", x: numericValues, nbinsx: bins, marker: { line: { width: 1, color: "#fff" } } }]}
                layout={{ xaxis: { title: { text: columnName } }, yaxis: { title: { text: "Effectif" } }, bargap: 0.02 }}
              />
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Boxplot">
          <PlotlyChart
            ariaLabel={`Boxplot de ${columnName}`}
            data={[
              {
                type: "box",
                x: numericValues,
                name: columnName,
                boxpoints: "outliers",
                boxmean: true,
                orientation: "h",
              },
            ]}
            layout={{ xaxis: { title: { text: columnName } }, yaxis: { showticklabels: false } }}
          />
        </ChartCard>

        <ChartCard title="QQ-plot (vs loi normale)">
          {qq ? (
            <PlotlyChart
              ariaLabel={`QQ-plot de ${columnName}`}
              data={[
                {
                  type: "scatter",
                  mode: "markers",
                  x: qq.theoretical,
                  y: qq.sample,
                  name: "Quantiles observés",
                  marker: { size: 5, opacity: 0.7 },
                },
                {
                  type: "scatter",
                  mode: "lines",
                  x: [qq.theoretical[0], qq.theoretical[qq.theoretical.length - 1]],
                  y: [
                    qq.slope * qq.theoretical[0] + qq.intercept,
                    qq.slope * qq.theoretical[qq.theoretical.length - 1] + qq.intercept,
                  ],
                  name: `Droite de Henry (R² = ${fmt(qq.r_squared)})`,
                  line: { color: "#b45309", width: 2, dash: "dash" },
                },
              ]}
              layout={{
                xaxis: { title: { text: "Quantiles théoriques (loi normale)" } },
                yaxis: { title: { text: "Quantiles observés" } },
                legend: { orientation: "h", y: -0.25 },
              }}
            />
          ) : (
            <p className="text-sm text-slate-500">Échantillon trop petit pour un QQ-plot.</p>
          )}
        </ChartCard>

        <ChartCard title="Valeurs dans l'ordre du fichier">
          <div className="flex h-full flex-col">
            <label className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={jitter}
                onChange={(e) => setJitter(e.target.checked)}
                className="accent-navy-700"
              />
              Jitter (décalage aléatoire léger pour les valeurs discrètes)
            </label>
            <div className="min-h-0 flex-1">
              <PlotlyChart
                ariaLabel={`Nuage valeur/index de ${columnName}`}
                data={[
                  {
                    type: "scattergl",
                    mode: "markers",
                    y: indexScatterY,
                    name: columnName,
                    marker: { size: 4, opacity: 0.55 },
                  },
                ]}
                layout={{
                  xaxis: { title: { text: "Index (ordre des lignes)" } },
                  yaxis: { title: { text: columnName } },
                }}
              />
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Tableau de statistiques */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-semibold text-navy-950">Tendance centrale</h3>
          <table className="w-full text-sm">
            <tbody>
              <StatsRow label="Moyenne" value={fmt(stats.central.mean)} />
              <StatsRow label="Médiane" value={fmt(stats.central.median)} />
              <StatsRow label="Mode" value={fmt(stats.central.mode)} />
            </tbody>
          </table>
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-semibold text-navy-950">Dispersion</h3>
          <table className="w-full text-sm">
            <tbody>
              <StatsRow label="Écart-type" value={fmt(stats.dispersion.std)} />
              <StatsRow label="Variance" value={fmt(stats.dispersion.variance)} />
              <StatsRow label="Écart interquartile (IQR)" value={fmt(stats.dispersion.iqr)} />
              <StatsRow label="Étendue" value={fmt(stats.dispersion.range)} />
              <StatsRow label="Coefficient de variation" value={fmt(stats.dispersion.cv)} />
            </tbody>
          </table>
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-semibold text-navy-950">Position et forme</h3>
          <table className="w-full text-sm">
            <tbody>
              <StatsRow label="Minimum" value={fmt(stats.position.min)} />
              <StatsRow label="P10" value={fmt(stats.position.p10)} />
              <StatsRow label="Q1" value={fmt(stats.position.q1)} />
              <StatsRow label="Q3" value={fmt(stats.position.q3)} />
              <StatsRow label="P90" value={fmt(stats.position.p90)} />
              <StatsRow label="Maximum" value={fmt(stats.position.max)} />
              <StatsRow label="Asymétrie (skewness)" value={fmt(stats.position.skewness)} />
              <StatsRow label="Aplatissement (kurtosis)" value={fmt(stats.position.kurtosis)} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
