import Link from "next/link";

/** Écran temporaire pour les onglets des phases à venir. */
export function PlaceholderPhase({
  title,
  phase,
  description,
}: {
  title: string;
  phase: number;
  description: string;
}) {
  return (
    <div className="card mx-auto max-w-2xl px-8 py-16 text-center">
      <span className="badge bg-navy-50 text-navy-700">Phase {phase} — à venir</span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-navy-950">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      <Link href="/app/donnees" className="btn-primary mt-8">
        Retour à l&apos;import des données
      </Link>
    </div>
  );
}
