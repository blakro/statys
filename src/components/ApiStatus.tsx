"use client";

import { useEffect, useState } from "react";

interface Health {
  status: string;
  python: string;
  pandas: string;
}

/** Vérifie que le moteur statistique Python (FastAPI) répond. */
export function ApiStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/py/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((h: Health) => setHealth(h))
      .catch(() => setFailed(true));
  }, []);

  return (
    <p className="text-xs text-slate-400" aria-live="polite">
      Moteur statistique :{" "}
      {health ? (
        <span className="text-emerald-600">
          opérationnel (Python {health.python}, pandas {health.pandas})
        </span>
      ) : failed ? (
        <span className="text-amber-600">
          hors ligne — lancez « npm run dev » qui démarre aussi l&apos;API Python (voir README)
        </span>
      ) : (
        "vérification…"
      )}
    </p>
  );
}
