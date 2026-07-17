"use client";

/** Helpers partagés par les vues bivariées. */

export const numberFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

export function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return numberFr.format(v);
}

export function fmtP(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  if (p < 0.001) return "< 0,001";
  return p.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

export function SignificanceBadge({ pvalue, alpha = 0.05 }: { pvalue: number; alpha?: number }) {
  const significant = pvalue <= alpha;
  return (
    <span
      className={`badge ${significant ? "bg-navy-50 text-navy-800" : "bg-slate-100 text-slate-600"}`}
    >
      {significant ? "Significatif à 5 %" : "Non significatif à 5 %"}
    </span>
  );
}

export function InterpretationCard({ text }: { text: string }) {
  return (
    <div className="card border-l-4 border-l-navy-600 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Interprétation
      </div>
      <p className="mt-1 text-sm text-slate-700">{text}</p>
    </div>
  );
}

export function LoadingNotice() {
  return (
    <p className="text-sm text-slate-500" aria-live="polite">
      Calcul en cours sur le moteur statistique…
    </p>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}
