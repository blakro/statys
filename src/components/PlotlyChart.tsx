"use client";

/**
 * Wrapper Plotly.js : bundle chargé dynamiquement côté client uniquement
 * (jamais dans le rendu serveur), avec une mise en forme homogène pour
 * toute la plateforme. scattergl (WebGL) est utilisé pour les gros nuages.
 */

import dynamic from "next/dynamic";
import createPlotlyComponent from "react-plotly.js/factory";
import type { Layout, Data, Config } from "plotly.js";

/**
 * Trace Plotly non contrainte : les typings officiels omettent plusieurs
 * attributs valides (nbinsx, hole…), on garde donc un type ouvert côté appelants.
 */
export type Trace = Record<string, unknown>;

const Plot = dynamic(
  async () => {
    const Plotly = (await import("plotly.js-dist-min")) as never;
    return createPlotlyComponent(Plotly);
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        Chargement du graphique…
      </div>
    ),
  }
);

const BASE_LAYOUT: Partial<Layout> = {
  font: { family: "var(--font-geist-sans), system-ui, sans-serif", size: 12, color: "#334155" },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  margin: { l: 56, r: 16, t: 8, b: 44 },
  separators: ", ", // virgule décimale, espace pour les milliers
  colorway: ["#315493", "#638ac4", "#94b0d8", "#233354", "#bfcfe8"],
};

const CONFIG: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  locale: "fr",
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
};

export function PlotlyChart({
  data,
  layout,
  ariaLabel,
}: {
  data: Trace[];
  layout?: Partial<Layout>;
  ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel} className="h-full w-full">
      <Plot
        data={data as Data[]}
        layout={{ ...BASE_LAYOUT, autosize: true, ...layout }}
        config={CONFIG}
        useResizeHandler
        className="h-full w-full"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
