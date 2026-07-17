import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card max-w-md p-8 text-center">
        <div className="text-4xl font-bold tabular-nums text-navy-200">404</div>
        <h1 className="mt-2 text-lg font-semibold text-navy-950">Page introuvable</h1>
        <p className="mt-2 text-sm text-slate-500">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
        <Link href="/app/donnees" className="btn-primary mt-6">
          Retour à la plateforme
        </Link>
      </div>
    </main>
  );
}
