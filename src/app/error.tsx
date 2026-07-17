"use client";

/** Garde-fou global : erreur inattendue côté client. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">
          ⚠️
        </div>
        <h1 className="text-lg font-semibold text-navy-950">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-slate-500">
          Vos données restent dans votre navigateur — rien n&apos;a été perdu côté serveur.
          {error.digest && (
            <span className="mt-1 block font-mono text-xs text-slate-500">réf. {error.digest}</span>
          )}
        </p>
        <button onClick={reset} className="btn-primary mt-6">
          Réessayer
        </button>
      </div>
    </main>
  );
}
