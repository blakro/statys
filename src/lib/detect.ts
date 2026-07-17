/**
 * Détection automatique du type des colonnes et conversion des valeurs,
 * avec prise en charge des formats français (virgule décimale, séparateurs
 * de milliers en espace, dates jj/mm/aaaa).
 */

import { ColumnType, DecimalSeparator, RawCell, isMissing } from "./dataset";

/** Taille maximale de l'échantillon utilisé pour inférer le type d'une colonne. */
const SAMPLE_SIZE = 2000;
/** Part minimale de valeurs conformes pour retenir un type (numérique ou date). */
const TYPE_THRESHOLD = 0.95;
/** Au-delà de ce nombre de modalités distinctes, une colonne texte n'est plus "catégorielle". */
const MAX_CATEGORICAL_CARDINALITY = 50;
/** Ratio distinct/valeurs au-delà duquel on considère la colonne comme texte libre. */
const MAX_CATEGORICAL_RATIO = 0.6;

// Espace fine insécable ( ) et insécable ( ) : fréquents dans les exports français.
const SPACE_CHARS = /[\s\u00a0\u202f]/g;

// Nombre "français" : 1 234,56 — virgule décimale, milliers en espace ou point.
const FR_NUMBER = /^[+-]?\d{1,3}(\.\d{3})*(,\d+)?$|^[+-]?\d+(,\d+)?$/;
// Nombre "anglo-saxon" : 1,234.56 — point décimal, milliers en virgule.
const EN_NUMBER = /^[+-]?\d{1,3}(,\d{3})*(\.\d+)?$|^[+-]?\d+(\.\d+)?$/;
// Notation scientifique (le séparateur décimal peut être , ou .).
const SCI_NUMBER = /^[+-]?\d+([.,]\d+)?[eE][+-]?\d+$/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;
const FR_DATE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})([ T]\d{2}:\d{2}(:\d{2})?)?$/;

/** Normalise une chaîne numérique potentielle : trim + suppression des espaces (milliers). */
function normalizeNumericString(s: string): string {
  return s.trim().replace(SPACE_CHARS, "").replace(/%$/, "");
}

/**
 * Convertit une chaîne en nombre selon le séparateur décimal demandé.
 * En mode "auto", applique une heuristique : présence des deux séparateurs →
 * le dernier rencontré est le décimal ; virgule seule → décimale (contexte français).
 */
export function parseNumber(raw: string, decimal: DecimalSeparator): number | null {
  const s = normalizeNumericString(raw);
  if (s === "") return null;

  if (SCI_NUMBER.test(s)) return Number(s.replace(",", "."));

  const effectiveDecimal = decimal === "auto" ? guessDecimal(s) : decimal;

  if (effectiveDecimal === ",") {
    if (!FR_NUMBER.test(s)) return null;
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (!EN_NUMBER.test(s)) return null;
  return Number(s.replace(/,/g, ""));
}

function guessDecimal(s: string): "," | "." {
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) return lastComma > lastDot ? "," : ".";
  if (lastComma >= 0) {
    // "1,234" isolé est ambigu ; en contexte bancaire français, la virgule est décimale
    // sauf motif évident de milliers répété (1,234,567).
    return /^\d{1,3}(,\d{3}){2,}$/.test(s) ? "." : ",";
  }
  if (lastDot >= 0) {
    return /^\d{1,3}(\.\d{3}){2,}$/.test(s) ? "," : ".";
  }
  return ".";
}

/** Convertit une chaîne en Date (ISO ou jj/mm/aaaa). Retourne null si non reconnue. */
export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (ISO_DATE.test(s)) {
    const d = new Date(s.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = FR_DATE.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const time = m[4] ? m[4].trim() : "00:00:00";
    const d = new Date(
      `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
        .toString()
        .padStart(2, "0")}T${time.length === 5 ? time + ":00" : time}`
    );
    // Rejette les dates impossibles (ex. 31/02) que le constructeur "corrigerait".
    if (d.getDate() !== day || d.getMonth() + 1 !== month) return null;
    return d;
  }
  return null;
}

/**
 * Infère le type d'une colonne à partir d'un échantillon de valeurs non manquantes.
 */
export function detectColumnType(values: RawCell[], decimal: DecimalSeparator): ColumnType {
  const sample: RawCell[] = [];
  for (const v of values) {
    if (!isMissing(v)) {
      sample.push(v);
      if (sample.length >= SAMPLE_SIZE) break;
    }
  }
  if (sample.length === 0) return "text";

  let numeric = 0;
  let dates = 0;
  const distinct = new Set<string>();

  for (const v of sample) {
    if (typeof v === "number") numeric++;
    else if (v instanceof Date) dates++;
    else if (typeof v === "boolean") distinct.add(String(v));
    else if (typeof v === "string") {
      if (parseNumber(v, decimal) !== null) numeric++;
      else if (parseDate(v) !== null) dates++;
      distinct.add(v.trim());
    }
    if (typeof v !== "string") distinct.add(String(v));
  }

  if (numeric / sample.length >= TYPE_THRESHOLD) return "numeric";
  if (dates / sample.length >= TYPE_THRESHOLD) return "date";

  const ratio = distinct.size / sample.length;
  if (distinct.size <= MAX_CATEGORICAL_CARDINALITY || ratio <= MAX_CATEGORICAL_RATIO) {
    return "categorical";
  }
  return "text";
}

/**
 * Convertit une cellule brute selon le type effectif de sa colonne.
 * - numeric → number | null
 * - date → Date | null
 * - categorical / text → string | null (les nombres sont restitués tels quels en libellé)
 */
export function convertCell(
  value: RawCell,
  type: ColumnType,
  decimal: DecimalSeparator
): number | string | Date | null {
  if (isMissing(value)) return null;
  switch (type) {
    case "numeric": {
      if (typeof value === "number") return value;
      if (typeof value === "boolean") return value ? 1 : 0;
      if (value instanceof Date) return null;
      return typeof value === "string" ? parseNumber(value, decimal) : null;
    }
    case "date": {
      if (value instanceof Date) return value;
      if (typeof value === "string") return parseDate(value);
      return null;
    }
    default: {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return String(value).trim();
    }
  }
}

/** Extrait les valeurs converties d'une colonne entière. */
export function convertColumn(
  rows: RawCell[][],
  colIndex: number,
  type: ColumnType,
  decimal: DecimalSeparator
): (number | string | Date | null)[] {
  return rows.map((row) => convertCell(row[colIndex] ?? null, type, decimal));
}
