"use client";

import { CsvDelimiter, DecimalSeparator, Encoding } from "@/lib/dataset";
import { useSession } from "@/lib/store";

/**
 * Barre de correction manuelle des options d'import : les valeurs détectées
 * automatiquement sont affichées, l'utilisateur peut les forcer et le fichier
 * est re-parsé instantanément depuis le buffer conservé en mémoire.
 */
export function ImportOptionsBar() {
  const { dataset, importOptions, updateOptions } = useSession();
  if (!dataset) return null;

  const { resolvedOptions } = dataset;
  const isCsv = dataset.sourceFormat === "csv";

  return (
    <div className="card flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Fichier</div>
        <div className="truncate text-sm font-medium text-navy-950" title={dataset.fileName}>
          {dataset.fileName}
        </div>
      </div>

      {isCsv && (
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Délimiteur{" "}
            {importOptions.delimiter === "auto" && resolvedOptions.delimiter
              ? `(détecté : « ${resolvedOptions.delimiter === "\t" ? "tab" : resolvedOptions.delimiter} »)`
              : ""}
          </span>
          <select
            className="select mt-1 block"
            value={importOptions.delimiter}
            onChange={(e) => updateOptions({ delimiter: e.target.value as CsvDelimiter })}
          >
            <option value="auto">Automatique</option>
            <option value=";">Point-virgule ( ; )</option>
            <option value=",">Virgule ( , )</option>
            <option value={"\t"}>Tabulation</option>
            <option value="|">Barre ( | )</option>
          </select>
        </label>
      )}

      {isCsv && (
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Encodage{" "}
            {importOptions.encoding === "auto" && resolvedOptions.encoding
              ? `(détecté : ${resolvedOptions.encoding})`
              : ""}
          </span>
          <select
            className="select mt-1 block"
            value={importOptions.encoding}
            onChange={(e) => updateOptions({ encoding: e.target.value as Encoding })}
          >
            <option value="auto">Automatique</option>
            <option value="utf-8">UTF-8</option>
            <option value="windows-1252">Latin-1 / Windows-1252</option>
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Séparateur décimal
        </span>
        <select
          className="select mt-1 block"
          value={importOptions.decimalSeparator}
          onChange={(e) =>
            updateOptions({ decimalSeparator: e.target.value as DecimalSeparator })
          }
        >
          <option value="auto">Automatique</option>
          <option value=",">Virgule ( 1 234,56 )</option>
          <option value=".">Point ( 1,234.56 )</option>
        </select>
      </label>

      {!isCsv && resolvedOptions.sheetNames.length > 1 && (
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Feuille
          </span>
          <select
            className="select mt-1 block"
            value={resolvedOptions.sheetName ?? ""}
            onChange={(e) => updateOptions({ sheetName: e.target.value })}
          >
            {resolvedOptions.sheetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
