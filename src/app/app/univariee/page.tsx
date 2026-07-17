"use client";

import { useState } from "react";
import Link from "next/link";
import { COLUMN_TYPE_LABELS } from "@/lib/dataset";
import { useSession } from "@/lib/store";
import { VariablePicker } from "@/components/univariate/VariablePicker";
import { NumericUnivariate } from "@/components/univariate/NumericUnivariate";
import { CategoricalUnivariate } from "@/components/univariate/CategoricalUnivariate";

export default function UnivarieePage() {
  const dataset = useSession((s) => s.dataset);
  const [selected, setSelected] = useState<string | null>(null);

  if (!dataset) {
    return (
      <div className="card mx-auto max-w-2xl px-8 py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-navy-950">Analyse univariée</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Importez d&apos;abord un jeu de données : les analyses se font en mémoire, sans stockage
          serveur, et sont perdues à la fermeture de l&apos;onglet.
        </p>
        <Link href="/app/donnees" className="btn-primary mt-8">
          Importer un fichier
        </Link>
      </div>
    );
  }

  const column = selected ? dataset.columns.find((c) => c.name === selected) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-navy-950">Analyse univariée</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sélectionnez une variable : l&apos;analyse s&apos;adapte automatiquement à son type
          (quantitative ou qualitative).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <VariablePicker dataset={dataset} selected={selected} onSelect={setSelected} />
        {column && (
          <span className="badge mb-2 bg-navy-50 text-navy-700">
            Type : {COLUMN_TYPE_LABELS[column.type]}
          </span>
        )}
      </div>

      {column?.type === "numeric" && (
        <NumericUnivariate key={column.name} dataset={dataset} columnName={column.name} />
      )}

      {(column?.type === "categorical" || column?.type === "text") && (
        <CategoricalUnivariate key={column.name} dataset={dataset} columnName={column.name} />
      )}

      {column?.type === "date" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          L&apos;analyse dédiée aux dates arrive dans une phase ultérieure. En attendant, vous
          pouvez forcer cette colonne en « Catégorielle » dans l&apos;onglet Données pour analyser
          ses fréquences.
        </p>
      )}
    </div>
  );
}
