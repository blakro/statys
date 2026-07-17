/**
 * Préparation des données bivariées côté navigateur : extraction de paires,
 * regroupement par modalité, tableau de contingence. Seul le strict
 * nécessaire est ensuite envoyé au moteur Python (le tableau de contingence
 * part même déjà agrégé — aucune donnée individuelle ne quitte la session).
 */

import { Dataset, isMissing } from "./dataset";
import { DecimalSeparator } from "./dataset";
import { convertCell } from "./detect";

/** Nombre maximal de modalités croisables (au-delà, l'analyse perd son sens). */
export const MAX_CROSS_MODALITIES = 30;

function categoricalLabel(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Paires (x, y) numériques alignées ; null quand une des deux manque. */
export function extractNumericPair(
  dataset: Dataset,
  xName: string,
  yName: string,
  decimal: DecimalSeparator
): { x: (number | null)[]; y: (number | null)[] } {
  const xi = dataset.columns.findIndex((c) => c.name === xName);
  const yi = dataset.columns.findIndex((c) => c.name === yName);
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  for (const row of dataset.rows) {
    const a = convertCell(row[xi] ?? null, "numeric", decimal);
    const b = convertCell(row[yi] ?? null, "numeric", decimal);
    x.push(typeof a === "number" && Number.isFinite(a) ? a : null);
    y.push(typeof b === "number" && Number.isFinite(b) ? b : null);
  }
  return { x, y };
}

/**
 * Regroupe les valeurs quantitatives par modalité de la variable qualitative.
 * Les lignes où l'une des deux valeurs manque sont ignorées.
 */
export function groupNumericByCategory(
  dataset: Dataset,
  categoricalName: string,
  numericName: string,
  decimal: DecimalSeparator
): { groups: Record<string, number[]>; excluded: number; tooManyGroups: boolean } {
  const ci = dataset.columns.findIndex((c) => c.name === categoricalName);
  const ni = dataset.columns.findIndex((c) => c.name === numericName);
  const groups: Record<string, number[]> = {};
  let excluded = 0;
  for (const row of dataset.rows) {
    const rawCat = row[ci] ?? null;
    const num = convertCell(row[ni] ?? null, "numeric", decimal);
    if (isMissing(rawCat) || typeof num !== "number" || !Number.isFinite(num)) {
      excluded++;
      continue;
    }
    const label = categoricalLabel(rawCat);
    (groups[label] ??= []).push(num);
  }
  return {
    groups,
    excluded,
    tooManyGroups: Object.keys(groups).length > MAX_CROSS_MODALITIES,
  };
}

export interface Crosstab {
  rowLabels: string[];
  colLabels: string[];
  observed: number[][];
  /** Lignes ignorées (valeur manquante sur l'une des deux variables). */
  excluded: number;
  total: number;
  tooManyModalities: boolean;
}

/**
 * Tableau de contingence trié par effectifs marginaux décroissants.
 * Les valeurs manquantes sont exclues du test (conformément à l'usage).
 */
export function buildCrosstab(dataset: Dataset, xName: string, yName: string): Crosstab {
  const xi = dataset.columns.findIndex((c) => c.name === xName);
  const yi = dataset.columns.findIndex((c) => c.name === yName);

  const counts = new Map<string, Map<string, number>>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  let excluded = 0;
  let total = 0;

  for (const row of dataset.rows) {
    const a = row[xi] ?? null;
    const b = row[yi] ?? null;
    if (isMissing(a) || isMissing(b)) {
      excluded++;
      continue;
    }
    const ra = categoricalLabel(a);
    const cb = categoricalLabel(b);
    const inner = counts.get(ra) ?? new Map<string, number>();
    inner.set(cb, (inner.get(cb) ?? 0) + 1);
    counts.set(ra, inner);
    rowTotals.set(ra, (rowTotals.get(ra) ?? 0) + 1);
    colTotals.set(cb, (colTotals.get(cb) ?? 0) + 1);
    total++;
  }

  const rowLabels = Array.from(rowTotals.entries())
    .sort((p, q) => q[1] - p[1])
    .map(([label]) => label);
  const colLabels = Array.from(colTotals.entries())
    .sort((p, q) => q[1] - p[1])
    .map(([label]) => label);

  const observed = rowLabels.map((r) =>
    colLabels.map((c) => counts.get(r)?.get(c) ?? 0)
  );

  return {
    rowLabels,
    colLabels,
    observed,
    excluded,
    total,
    tooManyModalities:
      rowLabels.length > MAX_CROSS_MODALITIES || colLabels.length > MAX_CROSS_MODALITIES,
  };
}
