"use client";

import { useState } from "react";
import { useSession } from "@/lib/store";

const DEMO_URL = "/demo/portefeuille-credit-demo.csv";
const DEMO_FILE_NAME = "portefeuille-credit-demo.csv";

/**
 * Charge le jeu de démonstration (portefeuille crédit fictif en FCFA) par le
 * même chemin qu'un fichier importé : détections, qualité et analyses
 * identiques à un vrai import.
 */
export function DemoDatasetButton() {
  const importFile = useSession((s) => s.importFile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDemo() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(DEMO_URL);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      await importFile(new File([blob], DEMO_FILE_NAME, { type: "text/csv" }));
    } catch {
      setError("Impossible de charger le jeu d'exemple. Réessayez ou importez un fichier.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <div className="text-sm font-semibold text-navy-950">
          Pas de fichier sous la main ?
        </div>
        <div className="text-xs text-slate-500">
          Portefeuille crédit fictif d&apos;une banque nigérienne — 320 dossiers, montants en
          FCFA, agences, secteurs, impayés. Données générées, aucune donnée réelle.
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button onClick={loadDemo} disabled={loading} className="btn-ghost">
          {loading ? "Chargement…" : "Essayer avec le jeu d'exemple"}
        </button>
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
