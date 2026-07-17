/**
 * Résumé de qualité des données : valeurs manquantes, doublons, cardinalité.
 * Calculé côté navigateur — les données ne quittent pas la session.
 */

import { Dataset, isMissing } from "./dataset";

export interface ColumnQuality {
  name: string;
  missing: number;
  missingPct: number;
  distinct: number;
}

export interface QualityReport {
  rowCount: number;
  columnCount: number;
  duplicateRows: number;
  totalMissing: number;
  columns: ColumnQuality[];
}

const MISSING_PLACEHOLDER = "\u0000<manquant>\u0000";
const FIELD_SEPARATOR = "\u0001";

export function computeQuality(dataset: Dataset): QualityReport {
  const { rows, columns } = dataset;
  const n = rows.length;

  const missingCounts = new Array<number>(columns.length).fill(0);
  const distinctSets = columns.map(() => new Set<string>());
  const rowHashes = new Set<string>();
  let duplicateRows = 0;

  for (const row of rows) {
    const keyParts: string[] = [];
    for (let c = 0; c < columns.length; c++) {
      const v = row[c] ?? null;
      if (isMissing(v)) {
        missingCounts[c]++;
        keyParts.push(MISSING_PLACEHOLDER);
      } else {
        const s = v instanceof Date ? v.toISOString() : String(v).trim();
        distinctSets[c].add(s);
        keyParts.push(s);
      }
    }
    const key = keyParts.join(FIELD_SEPARATOR);
    if (rowHashes.has(key)) duplicateRows++;
    else rowHashes.add(key);
  }

  const columnsQuality: ColumnQuality[] = columns.map((col, c) => ({
    name: col.name,
    missing: missingCounts[c],
    missingPct: n > 0 ? (missingCounts[c] / n) * 100 : 0,
    distinct: distinctSets[c].size,
  }));

  return {
    rowCount: n,
    columnCount: columns.length,
    duplicateRows,
    totalMissing: missingCounts.reduce((a, b) => a + b, 0),
    columns: columnsQuality,
  };
}
