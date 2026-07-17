/**
 * Modèle de données central de Statys.
 *
 * Le jeu de données importé vit exclusivement en mémoire côté navigateur
 * (aucun stockage serveur) : fermer l'onglet = ré-importer le fichier.
 */

/** Types de variables gérés par la plateforme. */
export type ColumnType = "numeric" | "categorical" | "date" | "text";

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  numeric: "Numérique",
  categorical: "Catégorielle",
  date: "Date",
  text: "Texte",
};

/** Valeur brute d'une cellule telle que produite par le parseur (CSV = string, Excel = types natifs). */
export type RawCell = string | number | boolean | Date | null;

export interface ColumnMeta {
  name: string;
  /** Type inféré automatiquement à l'import. */
  detectedType: ColumnType;
  /** Type effectif : l'utilisateur peut forcer un type différent (ex. code 0/1 → catégorielle). */
  type: ColumnType;
}

export type CsvDelimiter = "auto" | ";" | "," | "\t" | "|";
export type Encoding = "auto" | "utf-8" | "windows-1252";
export type DecimalSeparator = "auto" | "," | ".";

export interface ImportOptions {
  delimiter: CsvDelimiter;
  encoding: Encoding;
  decimalSeparator: DecimalSeparator;
  /** Feuille active pour les fichiers Excel. */
  sheetName?: string;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  delimiter: "auto",
  encoding: "auto",
  decimalSeparator: "auto",
};

export type SourceFormat = "csv" | "excel";

export interface Dataset {
  fileName: string;
  sourceFormat: SourceFormat;
  columns: ColumnMeta[];
  /** Lignes brutes, indexées [ligne][colonne]. */
  rows: RawCell[][];
  /** Options effectivement utilisées lors du parsing (après auto-détection). */
  resolvedOptions: {
    delimiter: string | null;
    encoding: string | null;
    decimalSeparator: "," | ".";
    sheetName: string | null;
    sheetNames: string[];
  };
}

/** Jetons considérés comme valeur manquante (insensible à la casse). */
const MISSING_TOKENS = new Set(["", "na", "n/a", "null", "nan", "#n/a", "-", "nd", "n.d."]);

export function isMissing(value: RawCell): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return MISSING_TOKENS.has(value.trim().toLowerCase());
  if (typeof value === "number") return Number.isNaN(value);
  return false;
}
