"use client";

import Link from "next/link";
import { useSession } from "@/lib/store";
import { FileDropzone } from "@/components/FileDropzone";
import { ImportOptionsBar } from "@/components/ImportOptionsBar";
import { QualitySummary } from "@/components/QualitySummary";
import { ColumnSchemaTable } from "@/components/ColumnSchemaTable";
import { DataPreview } from "@/components/DataPreview";
import { ApiStatus } from "@/components/ApiStatus";

export default function DonneesPage() {
  const { dataset, importError, isParsing, reset } = useSession();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-navy-950">
            Import et préparation des données
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Le fichier reste en mémoire dans votre navigateur : aucune donnée n&apos;est stockée
            sur un serveur.
          </p>
        </div>
        {dataset && (
          <button onClick={reset} className="btn-ghost">
            Importer un autre fichier
          </button>
        )}
      </div>

      {importError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {importError}
        </p>
      )}

      {!dataset && <FileDropzone />}

      {isParsing && (
        <div role="status" className="flex items-center gap-3 text-sm text-slate-600">
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-navy-200 border-t-navy-700"
          />
          Lecture du fichier…
        </div>
      )}

      {dataset && !isParsing && (
        <>
          <ImportOptionsBar />
          <QualitySummary />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ColumnSchemaTable />
            <DataPreview />
          </div>
          <div className="card flex flex-wrap items-center justify-between gap-3 border-navy-200 bg-navy-50 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-navy-900">
                Données prêtes pour l&apos;analyse
              </div>
              <div className="text-xs text-navy-700">
                Vérifiez les types détectés ci-dessus, puis explorez chaque variable.
              </div>
            </div>
            <Link href="/app/univariee" className="btn-primary">
              Passer à l&apos;analyse univariée →
            </Link>
          </div>
        </>
      )}

      <ApiStatus />
    </div>
  );
}
