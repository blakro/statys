import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { clerkEnabled } from "@/lib/roles";
import { AppNav } from "@/components/AppNav";
import { HeaderAuth } from "@/components/HeaderAuth";
import { RoleProvider } from "@/components/RoleProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // En mode démo, l'e-mail vient du cookie signé ; avec Clerk, du contexte client.
  let demoEmail: string | undefined;
  if (!clerkEnabled) {
    const token = cookies().get(SESSION_COOKIE)?.value;
    const session = token ? await verifySessionToken(token) : null;
    demoEmail = session?.email;
  }

  return (
    <RoleProvider demoUserLabel={demoEmail}>
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
            <HeaderAuth demoEmail={demoEmail} />
          </div>
          <AppNav />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </RoleProvider>
  );
}
