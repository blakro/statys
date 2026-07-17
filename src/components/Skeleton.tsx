/** Squelettes de chargement — remplacent le texte brut pendant les calculs. */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

/** État de chargement d'une analyse : annonce lecteur d'écran + squelettes. */
export function AnalysisSkeleton({ label }: { label?: string }) {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">{label ?? "Calcul en cours sur le moteur statistique…"}</span>
      <div className="card space-y-3 p-5">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card space-y-3 p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-60 w-full" />
        </div>
        <div className="card space-y-3 p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-60 w-full" />
        </div>
      </div>
    </div>
  );
}
