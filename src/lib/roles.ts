/**
 * Rôles Statys au sein d'une organisation (= une banque).
 *
 * Correspondance avec les rôles Clerk :
 *  - org:admin   → « admin »    : gère l'organisation (membres, invitations) ;
 *  - org:member  → « analyste » : importe, analyse, exporte ;
 *  - org:lecteur → « lecteur »  : consulte les analyses, sans export PDF
 *    (rôle personnalisé à créer dans le dashboard Clerk, voir README).
 *
 * Sans Clerk (mode démo de la Phase 1), l'utilisateur est « analyste ».
 */

export type StatysRole = "admin" | "analyste" | "lecteur";

export const ROLE_LABELS: Record<StatysRole, string> = {
  admin: "Administrateur banque",
  analyste: "Analyste",
  lecteur: "Lecteur seul",
};

/** Clerk est actif si la clé publique est présente (inlinée au build). */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Traduit un rôle d'organisation Clerk en rôle Statys. */
export function mapClerkRole(clerkRole: string | null | undefined): StatysRole {
  switch (clerkRole) {
    case "org:admin":
      return "admin";
    case "org:lecteur":
    case "org:reader":
      return "lecteur";
    default:
      // org:member, rôle inconnu ou aucune organisation active.
      return "analyste";
  }
}

/** Capacités par rôle — seul l'export PDF est restreint (les données restent locales). */
export function canExportPdf(role: StatysRole): boolean {
  return role !== "lecteur";
}
