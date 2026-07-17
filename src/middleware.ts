import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Deux modes d'authentification :
 *  - Clerk (Phase 5) si les clés sont configurées : organisations = banques,
 *    rôles, invitations — gérés par Clerk, aucune base à administrer ;
 *  - repli « démo » (Phase 1) sinon : cookie signé HMAC, compte unique.
 *
 * Sont protégés : l'espace d'analyse (/app) et le moteur statistique
 * (/api/py — les pages redirigent vers la connexion, l'API répond 401).
 */

const isProtectedPage = createRouteMatcher(["/app(.*)"]);
const isProtectedApi = createRouteMatcher(["/api/py(.*)"]);

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

function unauthorizedJson(): NextResponse {
  return NextResponse.json({ detail: "Authentification requise." }, { status: 401 });
}

async function legacyMiddleware(request: NextRequest) {
  if (!isProtectedPage(request) && !isProtectedApi(request)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (session) return NextResponse.next();

  if (isProtectedApi(request)) return unauthorizedJson();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isProtectedApi(request)) {
    const { userId } = auth();
    if (!userId) return unauthorizedJson();
    return NextResponse.next();
  }
  if (isProtectedPage(request)) {
    auth().protect(); // redirige vers /sign-in si non connecté
  }
  return NextResponse.next();
});

export default function middleware(request: NextRequest, event: never) {
  if (clerkConfigured) {
    return withClerk(request, event);
  }
  return legacyMiddleware(request);
}

export const config = {
  // Tout sauf les assets statiques ; inclut /app, /api et les pages d'auth.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|woff2?|ico)$).*)"],
};
