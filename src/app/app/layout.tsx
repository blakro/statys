import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-navy-900 bg-navy-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-700 font-bold">
              S
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Statys</div>
              <div className="text-xs leading-tight text-navy-300">
                Analyse statistique bancaire
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {session && (
              <span className="hidden text-sm text-navy-200 sm:inline">{session.email}</span>
            )}
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-navy-100 transition hover:bg-navy-800"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
        <AppNav />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
