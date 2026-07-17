/**
 * Lecture des fichiers importés (CSV, Excel) entièrement côté navigateur.
 *
 * Spécificités des exports français gérées :
 *  - délimiteur CSV point-virgule (auto-détecté, corrigeable manuellement) ;
 *  - encodage UTF-8 / Latin-1 (Windows-1252) détecté automatiquement ;
 *  - virgule décimale traitée à l'étape de typage (voir detect.ts).
 */

import Papa from "papaparse";
import {
  ColumnMeta,
  Dataset,
  ImportOptions,
  RawCell,
} from "./dataset";
import { detectColumnType } from "./detect";

/** Nombre maximal de lignes chargées en mémoire pour l'aperçu et les analyses. */
export const MAX_ROWS = 500_000;

export class ParseError extends Error {}

export function detectSourceFormat(fileName: string): "csv" | "excel" | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (["csv", "txt", "tsv"].includes(ext)) return "csv";
  if (["xlsx", "xls", "xlsm"].includes(ext)) return "excel";
  return null;
}

/**
 * Décode un buffer texte : essaie UTF-8 strict, bascule sur Windows-1252
 * (sur-ensemble usuel de Latin-1) si le contenu n'est pas de l'UTF-8 valide.
 */
export function decodeBuffer(
  buffer: ArrayBuffer,
  encoding: ImportOptions["encoding"]
): { text: string; encodingUsed: string } {
  if (encoding !== "auto") {
    return {
      text: new TextDecoder(encoding).decode(buffer),
      encodingUsed: encoding,
    };
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      encodingUsed: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(buffer),
      encodingUsed: "windows-1252",
    };
  }
}

function buildColumns(
  headers: string[],
  rows: RawCell[][],
  decimal: ImportOptions["decimalSeparator"]
): ColumnMeta[] {
  return headers.map((name, i) => {
    const values = rows.map((r) => r[i] ?? null);
    const detected = detectColumnType(values, decimal);
    return { name, detectedType: detected, type: detected };
  });
}

/** Garantit des noms de colonnes non vides et uniques. */
function normalizeHeaders(headers: unknown[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    let name = String(h ?? "").trim() || `Colonne ${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) name = `${name} (${count + 1})`;
    return name;
  });
}

function parseCsv(buffer: ArrayBuffer, options: ImportOptions): Dataset["resolvedOptions"] & {
  headers: string[];
  rows: RawCell[][];
} {
  const { text, encodingUsed } = decodeBuffer(buffer, options.encoding);

  const result = Papa.parse<string[]>(text, {
    delimiter: options.delimiter === "auto" ? "" : options.delimiter,
    delimitersToGuess: [";", ",", "\t", "|"],
    skipEmptyLines: "greedy",
  });

  if (result.errors.some((e) => e.type === "Delimiter")) {
    throw new ParseError("Impossible de détecter le délimiteur du fichier CSV.");
  }

  const data = result.data;
  if (data.length < 1) throw new ParseError("Le fichier est vide.");

  const headers = normalizeHeaders(data[0]);
  const rows = data.slice(1, MAX_ROWS + 1) as RawCell[][];

  return {
    headers,
    rows,
    delimiter: result.meta.delimiter ?? null,
    encoding: encodingUsed,
    decimalSeparator: options.decimalSeparator === "." ? "." : ",",
    sheetName: null,
    sheetNames: [],
  };
}

async function parseExcel(
  buffer: ArrayBuffer,
  options: ImportOptions
): Promise<
  Dataset["resolvedOptions"] & {
    headers: string[];
    rows: RawCell[][];
  }
> {
  // Chargée à la demande : SheetJS (~400 Ko) ne pèse pas sur le bundle initial.
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) throw new ParseError("Le classeur Excel ne contient aucune feuille.");

  const sheetName =
    options.sheetName && sheetNames.includes(options.sheetName)
      ? options.sheetName
      : sheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<RawCell[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (data.length < 1) throw new ParseError(`La feuille « ${sheetName} » est vide.`);

  const headers = normalizeHeaders(data[0] as unknown[]);
  const rows = data.slice(1, MAX_ROWS + 1);

  return {
    headers,
    rows,
    delimiter: null,
    encoding: null,
    decimalSeparator: options.decimalSeparator === "." ? "." : ",",
    sheetName,
    sheetNames,
  };
}

/**
 * Parse un fichier complet en Dataset. Le buffer d'origine est conservé par
 * l'appelant pour permettre un re-parsing avec d'autres options (délimiteur,
 * encodage, feuille) sans re-sélectionner le fichier.
 */
export async function parseFile(
  fileName: string,
  buffer: ArrayBuffer,
  options: ImportOptions
): Promise<Dataset> {
  const format = detectSourceFormat(fileName);
  if (!format) {
    throw new ParseError(
      "Format non pris en charge. Formats acceptés : CSV (.csv, .txt, .tsv) et Excel (.xlsx, .xls)."
    );
  }

  const parsed = format === "csv" ? parseCsv(buffer, options) : await parseExcel(buffer, options);
  const { headers, rows, ...resolvedOptions } = parsed;

  // Aligne chaque ligne sur le nombre de colonnes de l'en-tête.
  const width = headers.length;
  const alignedRows = rows.map((row) => {
    if (row.length === width) return row;
    const aligned = row.slice(0, width);
    while (aligned.length < width) aligned.push(null);
    return aligned;
  });

  return {
    fileName,
    sourceFormat: format,
    columns: buildColumns(headers, alignedRows, options.decimalSeparator),
    rows: alignedRows,
    resolvedOptions,
  };
}
