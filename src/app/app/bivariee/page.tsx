"use client";

import { useState } from "react";
import Link from "next/link";
import { COLUMN_TYPE_LABELS, ColumnMeta } from "@/lib/dataset";
import { useSession } from "@/lib/store";
import { NumericNumeric } from "@/components/bivariate/NumericNumeric";
import { CategoricalNumeric } from "@/components/bivariate/CategoricalNumeric";
import { CategoricalCategorical } from "@/components/bivariate/CategoricalCategorical";
import { CorrelationMatrix } from "@/components/bivariate/CorrelationMatrix";

type Mode = "pair" | "matrix";

/** date → non géré ; text → traité comme catégoriel pour le croisement. */
function effectiveKind(col: ColumnMeta): "numeric" | "categorical" | "date" {
  if (col.type === "numeric") return "numeric";
  if (col.type === "date") return "date";
  return "categorical";
}

function Picker({
  label,
  columns,
  value,
  exclude,
  onChange,
}: {
  label: string;
  columns: ColumnMeta[];
  value: string | null;
  exclude: string | null;
  onChange: (name: string) => void;
}) {
  return (
    <label className="block w-full max-w-xs">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <select
        className="select w-full py-2.5"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Choisir une variable…
        </option>
        {columns
          .filter((c) => c.name !== exclude)
          .map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} — {COLUMN_TYPE_LABELS[c.type]}
            </option>
          ))}
      </select>
    </label>
  );
}

export default function BivarieePage() {
  const dataset = useSession((s) => s.dataset);
  const [mode, setMode] = useState<Mode>("pair");
  const [xName, setXName] = useState<string | null>(null);
  const [yName, setYName] = useState<string | null>(null);

  if (!dataset) {
    return (
      <div className="card mx-auto max-w-2xl px-8 py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-navy-950">Analyse bivariée</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Importez d&apos;abord un jeu de données pour croiser deux variables.
        </p>
        <Link href="/app/donnees" className="btn-primary mt-8">
          Importer un fichier
        </Link>
      </div>
    );
  }

  const xCol = xName ? dataset.columns.find((c) => c.name === xName) : undefined;
  const yCol = yName ? dataset.columns.find((c) => c.name === yName) : undefined;

  let analysis: React.ReactNode = null;
  if (mode === "pair" && xCol && yCol) {
    const kx = effectiveKind(xCol);
    const ky = effectiveKind(yCol);
    if (kx === "date" || ky === "date") {
      analysis = (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Le croisement avec une variable de type date arrive dans une phase ultérieure. Vous
          pouvez forcer la colonne en « Catégorielle » dans l&apos;onglet Données (ex. pour croiser
          par année).
        </p>
      );
    } else if (kx === "numeric" && ky === "numeric") {
      analysis = (
        <NumericNumeric
          key={`${xCol.name}|${yCol.name}`}
          dataset={dataset}
          xName={xCol.name}
          yName={yCol.name}
        />
      );
    } else if (kx === "categorical" && ky === "categorical") {
      analysis = (
        <CategoricalCategorical
          key={`${xCol.name}|${yCol.name}`}
          dataset={dataset}
          xName={xCol.name}
          yName={yCol.name}
        />
      );
    } else {
      const catName = kx === "categorical" ? xCol.name : yCol.name;
      const numName = kx === "numeric" ? xCol.name : yCol.name;
      analysis = (
        <CategoricalNumeric
          key={`${catName}|${numName}`}
          dataset={dataset}
          categoricalName={catName}
          numericName={numName}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-navy-950">Analyse bivariée</h1>
          <p className="mt-1 text-sm text-slate-500">
            Le test statistique est sélectionné automatiquement selon les conditions vérifiées
            (normalité, homogénéité des variances, effectifs attendus).
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          <button
            className={`rounded-md px-3 py-1.5 ${mode === "pair" ? "bg-navy-800 text-white" : "text-slate-600"}`}
            onClick={() => setMode("pair")}
          >
            Croisement de deux variables
          </button>
          <button
            className={`rounded-md px-3 py-1.5 ${mode === "matrix" ? "bg-navy-800 text-white" : "text-slate-600"}`}
            onClick={() => setMode("matrix")}
          >
            Matrice de corrélation
          </button>
        </div>
      </div>

      {mode === "pair" ? (
        <>
          <div className="flex flex-wrap gap-4">
            <Picker
              label="Variable X"
              columns={dataset.columns}
              value={xName}
              exclude={yName}
              onChange={setXName}
            />
            <Picker
              label="Variable Y"
              columns={dataset.columns}
              value={yName}
              exclude={xName}
              onChange={setYName}
            />
          </div>
          {analysis}
        </>
      ) : (
        <CorrelationMatrix dataset={dataset} />
      )}
    </div>
  );
}
