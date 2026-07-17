"use client";

/**
 * Journal des analyses de la session, alimenté au fil de l'eau par les
 * onglets d'analyse : chaque analyse effectuée devient une section
 * exportable du rapport PDF (graphique + tableau + interprétation).
 *
 * Les figures sont stockées sous forme de spécifications Plotly
 * (data + layout) puis converties en PNG au moment de la génération —
 * les graphiques du PDF sont donc identiques à ceux de l'écran.
 */

import type { Layout } from "plotly.js";
import type { Trace } from "@/components/PlotlyChart";

export type ReportKind =
  | "univariate-numeric"
  | "univariate-categorical"
  | "bivariate-nn"
  | "bivariate-cn"
  | "bivariate-cc"
  | "correlation-matrix";

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  "univariate-numeric": "Univariée — quantitative",
  "univariate-categorical": "Univariée — qualitative",
  "bivariate-nn": "Bivariée — corrélation",
  "bivariate-cn": "Bivariée — comparaison de groupes",
  "bivariate-cc": "Bivariée — tableau croisé",
  "correlation-matrix": "Matrice de corrélation",
};

export interface ReportFigure {
  title: string;
  data: Trace[];
  layout: Partial<Layout>;
}

export interface ReportTableSpec {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ReportEntry {
  /** Identifiant stable (type + variables) : re-visiter une analyse la remplace. */
  id: string;
  kind: ReportKind;
  title: string;
  subtitle: string;
  interpretation: string;
  figures: ReportFigure[];
  tables: ReportTableSpec[];
  createdAt: number;
}

/** Mise en forme d'export : fond blanc, dimensions fixes pour le PDF. */
const EXPORT_LAYOUT: Partial<Layout> = {
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  width: 900,
  height: 430,
  margin: { l: 64, r: 24, t: 28, b: 52 },
  font: { family: "Helvetica, Arial, sans-serif", size: 13, color: "#334155" },
  separators: ", ",
};

/** Sous-échantillonnage régulier pour les figures du rapport (poids du PDF). */
export function downsample<T>(values: T[], max: number): T[] {
  if (values.length <= max) return values;
  const step = values.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(values[Math.floor(i * step)]);
  return out;
}

/** Convertit une figure du journal en PNG (data URI), sans montage DOM. */
export async function figureToPng(figure: ReportFigure, scale: number): Promise<string> {
  const Plotly = (await import("plotly.js-dist-min")) as unknown as {
    toImage: (
      fig: { data: unknown[]; layout: unknown },
      opts: { format: string; width: number; height: number; scale: number }
    ) => Promise<string>;
  };
  return Plotly.toImage(
    { data: figure.data as unknown[], layout: { ...figure.layout, ...EXPORT_LAYOUT } },
    { format: "png", width: 900, height: 430, scale }
  );
}
