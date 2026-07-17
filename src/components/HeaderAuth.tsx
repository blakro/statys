"use client";

/**
 * Zone d'identité du header :
 *  - Clerk actif : sélecteur d'organisation (= banque, avec gestion des
 *    membres et invitations intégrée), badge de rôle, menu utilisateur ;
 *  - mode démo : e-mail + déconnexion, avec badge « démo ».
 */

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { clerkEnabled, ROLE_LABELS } from "@/lib/roles";
import { useIdentity } from "./RoleProvider";

const widgetAppearance = {
  elements: {
    organizationSwitcherTrigger: "text-navy-100 hover:bg-navy-800",
    userButtonAvatarBox: "h-8 w-8",
  },
};

function RoleBadge() {
  const { role } = useIdentity();
  return (
    <span className="badge hidden border border-navy-700 bg-navy-900 text-navy-200 sm:inline-flex">
      {ROLE_LABELS[role]}
    </span>
  );
}

export function HeaderAuth({ demoEmail }: { demoEmail?: string }) {
  if (!clerkEnabled) {
    return (
      <div className="flex items-center gap-4">
        <span className="badge hidden border border-amber-400/40 bg-amber-400/10 text-amber-200 sm:inline-flex">
          Mode démo — Clerk non configuré
        </span>
        {demoEmail && <span className="hidden text-sm text-navy-200 md:inline">{demoEmail}</span>}
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-navy-100 transition hover:bg-navy-800"
          >
            Déconnexion
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <RoleBadge />
      <OrganizationSwitcher
        hidePersonal
        appearance={widgetAppearance}
        organizationProfileMode="modal"
        createOrganizationMode="modal"
      />
      <UserButton appearance={widgetAppearance} />
    </div>
  );
}
