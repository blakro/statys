"use client";

/**
 * Fournit l'identité de session (rôle Statys, libellé utilisateur, banque)
 * à toute l'application, quel que soit le mode d'authentification :
 *  - Clerk actif : rôle dérivé de l'organisation active ;
 *  - mode démo : analyste, sans organisation.
 *
 * `clerkEnabled` est une constante de build : la branche rendue ne change
 * jamais au cours de la vie de l'application (pas de violation des règles
 * des hooks).
 */

import { createContext, useContext } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { clerkEnabled, mapClerkRole, StatysRole } from "@/lib/roles";

export interface SessionIdentity {
  role: StatysRole;
  /** Libellé affichable de l'utilisateur (e-mail ou nom). */
  userLabel: string;
  /** Nom de l'organisation active (= banque), vide sinon. */
  orgName: string;
}

const DEMO_IDENTITY: SessionIdentity = {
  role: "analyste",
  userLabel: "compte de démonstration",
  orgName: "",
};

const IdentityContext = createContext<SessionIdentity>(DEMO_IDENTITY);

export function useIdentity(): SessionIdentity {
  return useContext(IdentityContext);
}

function ClerkIdentityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { organization, membership } = useOrganization();
  const value: SessionIdentity = {
    role: mapClerkRole(membership?.role),
    userLabel:
      user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? user?.id ?? "",
    orgName: organization?.name ?? "",
  };
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function RoleProvider({
  children,
  demoUserLabel,
}: {
  children: React.ReactNode;
  demoUserLabel?: string;
}) {
  if (!clerkEnabled) {
    return (
      <IdentityContext.Provider
        value={{ ...DEMO_IDENTITY, userLabel: demoUserLabel || DEMO_IDENTITY.userLabel }}
      >
        {children}
      </IdentityContext.Provider>
    );
  }
  return <ClerkIdentityProvider>{children}</ClerkIdentityProvider>;
}
