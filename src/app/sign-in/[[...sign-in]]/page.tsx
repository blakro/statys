import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/roles";

/** Connexion Clerk (multi-tenant). En mode démo, /login prend le relais. */
export default function SignInPage() {
  if (!clerkEnabled) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <div>
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-navy-700 text-xl font-bold text-white">
            S
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Statys</h1>
          <p className="mt-1 text-sm text-navy-300">
            Analyse statistique pour établissements bancaires
          </p>
        </div>
        <SignIn />
      </div>
    </main>
  );
}
