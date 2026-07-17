"use client";

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
        <p className="text-sm text-slate-500" aria-live="polite">
          Lecture du fichier…
        </p>
      )}

      {dataset && !isParsing && (
        <>
          <ImportOptionsBar />
          <QualitySummary />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ColumnSchemaTable />
            <DataPreview />
          </div>
        </>
      )}

      <ApiStatus />
    </div>
  );
}
