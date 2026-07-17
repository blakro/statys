"use client";

import { useEffect, useMemo, useState } from "react";
import { Dataset } from "@/lib/dataset";
import { useSession } from "@/lib/store";
import { groupNumericByCategory, MAX_CROSS_MODALITIES } from "@/lib/bivariate-prep";
import { ApiError, CategoricalNumericResult, fetchCategoricalNumeric } from "@/lib/api";
import { downsample } from "@/lib/report";
import { PlotlyChart } from "@/components/PlotlyChart";
import {
  ErrorNotice,
  fmt,
  fmtP,
  InterpretationCard,
  LoadingNotice,
  numberFr,
} from "./common";

/** Lignes du tableau de décision du brief, pour affichage avec la ligne active. */
const DECISION_TABLE = [
  { k: "2", normal: "Oui", homog: "Oui", test: "t de Student (échantillons indépendants)" },
  { k: "2", normal: "Oui", homog: "Non", test: "t de Welch" },
  { k: "2", normal: "Non", homog: "—", test: "Mann-Whitney (rank-sum)" },
  { k: "> 2", normal: "Oui", homog: "Oui", test: "ANOVA à un facteur" },
  { k: "> 2", normal: "Oui", homog: "Non", test: "ANOVA de Welch" },
  { k: "> 2", normal: "Non", homog: "—", test: "Kruskal-Wallis" },
];

/** Qualitatif × quantitatif : arbre de décision, boxplots, tableau par groupe. */
export function CategoricalNumeric({
  dataset,
  categoricalName,
  numericName,
}: {
  dataset: Dataset;
  categoricalName: string;
  numericName: string;
}) {
  const decimal = useSession((s) => s.importOptions.decimalSeparator);
  const [includeKs, setIncludeKs] = useState(false);
  const prep = useMemo(
    () => groupNumericByCategory(dataset, categoricalName, numericName, decimal),
    [dataset, categoricalName, numericName, decimal]
  );

  const [result, setResult] = useState<CategoricalNumericResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prep.tooManyGroups) return;
    let cancelled = false;
    setResult(null);
    setError(null);
    fetchCategoricalNumeric(
      prep.groups,
      includeKs,
      `${dataset.fileName}|${categoricalName}|${numericName}|${decimal}`
    )
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Erreur inattendue."));
    return () => {
      cancelled = true;
    };
  }, [dataset.fileName, categoricalName, numericName, prep, includeKs, decimal]);

  // Alimente le journal du rapport PDF.
  const addReportEntry = useSession((s) => s.addReportEntry);
  useEffect(() => {
    if (!result) return;
    addReportEntry({
      id: `cn:${categoricalName}|${numericName}`,
      kind: "bivariate-cn",
      title: `${numericName} selon ${categoricalName}`,
      subtitle: `Comparaison de ${result.decision.n_groups} groupes — chemin : ${result.decision.path.join(" → ")}`,
      interpretation: result.interpretation,
      figures: [
        {
          title: `${numericName} par modalité de ${categoricalName}`,
          data: Object.entries(prep.groups).map(([label, values]) => ({
            type: "box",
            y: downsample(values, 10000),
            name: label,
            boxmean: true,
            boxpoints: "outliers",
          })),
          layout: { showlegend: false, yaxis: { title: { text: numericName } } },
        },
      ],
      tables: [
        {
          title: "Conditions vérifiées et test appliqué",
          columns: ["Étape", "Résultat"],
          rows: [
            [
              "Normalité par groupe",
              result.assumptions.all_normal
                ? "toutes les distributions sont normales"
                : "au moins un groupe non normal",
            ],
            [
              "Homogénéité des variances (Levene)",
              `p = ${fmtP(result.assumptions.homogeneity.levene.pvalue)} — ${
                result.assumptions.homogeneous ? "homogènes" : "non homogènes"
              }`,
            ],
            [
              "Test appliqué",
              `${result.test.name} — statistique = ${fmt(result.test.statistic)}${
                result.test.df !== null ? `, ddl = ${String(result.test.df)}` : ""
              }, p = ${fmtP(result.test.pvalue)}`,
            ],
            [
              "Taille d'effet",
              `${result.effect_size.name} = ${fmt(result.effect_size.value)} (${result.effect_size.magnitude})`,
            ],
            ...(result.ks
              ? [
                  [
                    "Kolmogorov-Smirnov (option)",
                    `D = ${fmt(result.ks.statistic)}, p = ${fmtP(result.ks.pvalue)}`,
                  ] as (string | number)[],
                ]
              : []),
          ],
        },
        {
          title: "Statistiques par groupe",
          columns: ["Groupe", "n", "Moyenne", "IC 95 % (moyenne)", "Médiane", "Écart-type"],
          rows: result.groups.map((g) => [
            g.label,
            numberFr.format(g.n),
            fmt(g.mean),
            `[${fmt(g.ci95[0])} ; ${fmt(g.ci95[1])}]`,
            fmt(g.median),
            fmt(g.std),
          ]),
        },
      ],
      createdAt: Date.now(),
    });
  }, [result, categoricalName, numericName, prep.groups, addReportEntry]);

  if (prep.tooManyGroups) {
    return (
      <ErrorNotice
        message={`« ${categoricalName} » compte plus de ${MAX_CROSS_MODALITIES} modalités : la comparaison n'aurait pas de sens statistique. Regroupez d'abord les modalités rares.`}
      />
    );
  }
  if (error) return <ErrorNotice message={error} />;
  if (!result) return <LoadingNotice />;

  const chosen = result.test.name;
  const nGroups = result.decision.n_groups;

  return (
    <div className="space-y-6">
      <InterpretationCard text={result.interpretation} />

      {result.dropped_groups.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Modalités écartées (moins de 3 valeurs) :{" "}
          {result.dropped_groups.map((g) => `« ${g} »`).join(", ")}.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Boxplot par modalité */}
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-navy-950">
            {numericName} par modalité de {categoricalName}
          </h3>
          <div className="h-96">
            <PlotlyChart
              ariaLabel={`Boxplot de ${numericName} par ${categoricalName}`}
              data={Object.entries(prep.groups).map(([label, values]) => ({
                type: "box",
                y: values,
                name: label,
                boxmean: true,
                boxpoints: "outliers",
              }))}
              layout={{
                showlegend: false,
                yaxis: { title: { text: numericName } },
                xaxis: { automargin: true },
              }}
            />
          </div>
        </div>

        {/* Arbre de décision */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-navy-950">Sélection automatique du test</h3>
            <p className="text-xs text-slate-500">Chemin suivi : {result.decision.path.join(" → ")}</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Modalités</th>
                <th scope="col" className="px-4 py-2 font-medium">Normalité</th>
                <th scope="col" className="px-4 py-2 font-medium">Var. homogènes</th>
                <th scope="col" className="px-4 py-2 font-medium">Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DECISION_TABLE.map((row) => {
                const active = row.test === chosen || chosen.startsWith(row.test.split(" (")[0]);
                const kMatches = row.k === "2" ? nGroups === 2 : nGroups > 2;
                const highlight = active && kMatches;
                return (
                  <tr
                    key={row.test}
                    className={highlight ? "bg-navy-50 font-medium text-navy-900" : "text-slate-500"}
                  >
                    <td className="px-4 py-2">{row.k}</td>
                    <td className="px-4 py-2">{row.normal}</td>
                    <td className="px-4 py-2">{row.homog}</td>
                    <td className="px-4 py-2">
                      {row.test}
                      {highlight && <span className="ml-2 text-navy-700">◀ appliqué</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conditions vérifiées */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-navy-950">
              1. Normalité par groupe (Shapiro-Wilk{" "}
              <span className="font-normal text-slate-400">/ D&apos;Agostino si n ≥ 5000</span>)
            </h3>
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Groupe</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">p-value</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Conclusion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(result.assumptions.normality).map(([label, norm]) => (
                  <tr key={label}>
                    <td className="max-w-[160px] truncate px-4 py-2" title={label}>{label}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtP(norm.pvalue)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`badge ${norm.normal ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {norm.normal ? "normale" : "non normale"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-navy-950">
            2. Homogénéité des variances
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>
                Levene (Brown-Forsythe) — statistique ={" "}
                <span className="tabular-nums">{fmt(result.assumptions.homogeneity.levene.statistic)}</span>,
                p = <span className="tabular-nums">{fmtP(result.assumptions.homogeneity.levene.pvalue)}</span>
              </span>
              <span
                className={`badge ${result.assumptions.homogeneity.levene.homogeneous ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
              >
                {result.assumptions.homogeneity.levene.homogeneous ? "homogènes" : "non homogènes"}
              </span>
            </div>
            {result.assumptions.homogeneity.bartlett && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
                <span>
                  Bartlett (complément, distributions normales) — p ={" "}
                  <span className="tabular-nums">{fmtP(result.assumptions.homogeneity.bartlett.pvalue)}</span>
                </span>
                <span className="badge bg-slate-100 text-slate-600">
                  {result.assumptions.homogeneity.bartlett.homogeneous ? "homogènes" : "non homogènes"}
                </span>
              </div>
            )}
          </div>

          <h3 className="mb-2 mt-5 text-sm font-semibold text-navy-950">3. Résultat du test</h3>
          <div className="rounded-lg border border-navy-200 bg-navy-50 px-4 py-3">
            <div className="font-medium text-navy-900">{result.test.name}</div>
            <div className="mt-1 text-sm text-navy-800">
              statistique = <span className="tabular-nums">{fmt(result.test.statistic)}</span>
              {result.test.df !== null && (
                <>
                  {" "}— ddl = <span className="tabular-nums">{String(result.test.df)}</span>
                </>
              )}{" "}
              — p = <span className="tabular-nums font-semibold">{fmtP(result.test.pvalue)}</span>
            </div>
            <div className="mt-2 text-sm text-navy-800">
              Taille d&apos;effet : {result.effect_size.name} ={" "}
              <span className="tabular-nums font-semibold">{fmt(result.effect_size.value)}</span>{" "}
              <span className="badge ml-1 bg-white text-navy-700">{result.effect_size.magnitude}</span>
            </div>
          </div>

          {nGroups === 2 && (
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeKs}
                onChange={(e) => setIncludeKs(e.target.checked)}
                className="accent-navy-700"
              />
              Test complémentaire de Kolmogorov-Smirnov (comparaison directe des deux distributions)
            </label>
          )}
          {result.ks && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              KS à deux échantillons : D = {fmt(result.ks.statistic)}, p = {fmtP(result.ks.pvalue)} —{" "}
              {result.ks.different
                ? "les deux distributions diffèrent significativement."
                : "pas de différence significative entre les distributions."}
            </p>
          )}
        </div>
      </div>

      {/* Tableau par groupe */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-navy-950">Statistiques par groupe</h3>
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Groupe</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">n</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Moyenne</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">IC 95 % (moyenne)</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Médiane</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Écart-type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.groups.map((g) => (
                <tr key={g.label}>
                  <td className="max-w-[180px] truncate px-4 py-2 font-medium text-navy-950" title={g.label}>
                    {g.label}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{numberFr.format(g.n)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(g.mean)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    [{fmt(g.ci95[0])} ; {fmt(g.ci95[1])}]
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(g.median)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(g.std)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
