"""
Moteur statistique de Statys — fonctions serverless Python (FastAPI).

Déployé sur Vercel dans le même projet que le frontend Next.js :
- en développement : uvicorn sert l'API sur le port 8000, Next.js proxifie
  /api/py/* vers elle (voir next.config.mjs) ;
- en production : Vercel exécute ce fichier comme fonction serverless.

Principe de confidentialité : l'API est sans état. Chaque requête reçoit la
tranche de données strictement nécessaire au calcul, répond, et n'écrit rien
sur disque. Aucune donnée cliente n'est stockée côté serveur.
"""

import platform

import pandas as pd
import scipy
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    # Exécution en package (uvicorn api.index:app depuis web/).
    from api._stats import univariate_numeric
except ImportError:  # Exécution comme module isolé (fonction serverless Vercel).
    from _stats import univariate_numeric

app = FastAPI(
    title="Statys — moteur statistique",
    docs_url="/api/py/docs",
    openapi_url="/api/py/openapi.json",
)


@app.get("/api/py/health")
def health() -> dict:
    """Vérification de disponibilité et des versions des librairies de calcul."""
    return {
        "status": "ok",
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "scipy": scipy.__version__,
    }


class NumericColumn(BaseModel):
    """Valeurs d'une colonne quantitative ; null = valeur manquante ou invalide."""

    values: list[float | None] = Field(..., max_length=300_000)


@app.post("/api/py/univariate/numeric")
def api_univariate_numeric(payload: NumericColumn) -> dict:
    """
    Analyse univariée d'une variable quantitative : statistiques descriptives,
    test de normalité (Shapiro-Wilk si n < 5000, sinon D'Agostino-Pearson)
    et données du QQ-plot.
    """
    try:
        return univariate_numeric(payload.values)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
