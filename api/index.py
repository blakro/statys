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
import sys

import pandas as pd
import scipy
from fastapi import FastAPI

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
