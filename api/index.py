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

import datetime
import platform

import pandas as pd
import scipy
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

try:
    # Exécution en package (uvicorn api.index:app depuis web/).
    from api._bivariate import (
        categorical_categorical,
        categorical_numeric,
        correlation_matrix,
        correlations,
    )
    from api._report import PdfEngineUnavailable, render_pdf
    from api._stats import univariate_numeric
except ImportError:  # Exécution comme module isolé (fonction serverless Vercel).
    from _bivariate import (
        categorical_categorical,
        categorical_numeric,
        correlation_matrix,
        correlations,
    )
    from _report import PdfEngineUnavailable, render_pdf
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


class NumericPair(BaseModel):
    """Deux colonnes quantitatives alignées ligne à ligne (null = manquant)."""

    x: list[float | None] = Field(..., max_length=300_000)
    y: list[float | None] = Field(..., max_length=300_000)


@app.post("/api/py/bivariate/numeric-numeric")
def api_bivariate_numeric_numeric(payload: NumericPair) -> dict:
    """Corrélations Pearson / Spearman / Kendall (p-value + IC 95 %) et régression."""
    try:
        return correlations(payload.x, payload.y)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


class CorrelationMatrixInput(BaseModel):
    """Colonnes quantitatives (2 à 20) pour la matrice de corrélation."""

    columns: dict[str, list[float | None]]
    method: str = "pearson"


@app.post("/api/py/bivariate/correlation-matrix")
def api_correlation_matrix(payload: CorrelationMatrixInput) -> dict:
    if len(payload.columns) > 20:
        raise HTTPException(status_code=422, detail="20 variables maximum dans la matrice")
    if sum(len(v) for v in payload.columns.values()) > 2_000_000:
        raise HTTPException(status_code=422, detail="volume de données trop important")
    try:
        return correlation_matrix(payload.columns, payload.method)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


class GroupedValues(BaseModel):
    """Valeurs quantitatives regroupées par modalité de la variable qualitative."""

    groups: dict[str, list[float | None]]
    include_ks: bool = False


@app.post("/api/py/bivariate/categorical-numeric")
def api_bivariate_categorical_numeric(payload: GroupedValues) -> dict:
    """
    Comparaison quantitative × qualitative avec sélection automatique du test
    (Student / Welch / Mann-Whitney / ANOVA / ANOVA de Welch / Kruskal-Wallis)
    et taille d'effet systématique.
    """
    if sum(len(v) for v in payload.groups.values()) > 300_000:
        raise HTTPException(status_code=422, detail="volume de données trop important")
    try:
        return categorical_numeric(payload.groups, payload.include_ks)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


class ContingencyInput(BaseModel):
    """Tableau de contingence agrégé côté navigateur (aucune donnée individuelle)."""

    observed: list[list[int]]
    row_labels: list[str]
    col_labels: list[str]


@app.post("/api/py/bivariate/categorical-categorical")
def api_bivariate_categorical_categorical(payload: ContingencyInput) -> dict:
    """Khi-deux d'indépendance (ou Fisher exact si 2×2 avec attendu < 5), V de Cramér, résidus."""
    if len(payload.observed) > 100 or any(len(r) > 100 for r in payload.observed):
        raise HTTPException(status_code=422, detail="tableau de contingence trop grand")
    try:
        return categorical_categorical(payload.observed, payload.row_labels, payload.col_labels)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


class ReportImage(BaseModel):
    title: str = ""
    data_uri: str


class ReportTable(BaseModel):
    title: str = ""
    columns: list[str]
    rows: list[list[str | int | float]]


class ReportSection(BaseModel):
    kind: str
    title: str
    subtitle: str = ""
    interpretation: str = ""
    images: list[ReportImage] = []
    tables: list[ReportTable] = []


class ReportBranding(BaseModel):
    bank_name: str = ""
    report_title: str = ""
    author: str = ""
    accent_color: str = ""
    # Devise du rapport : XOF (FCFA) par défaut, « none » pour aucune.
    currency: str = "XOF"
    # Logo de l'établissement (data URI PNG/JPEG), affiché en page de garde.
    logo_data_uri: str = ""


class ReportContext(BaseModel):
    file_name: str = ""
    row_count: int = 0
    column_count: int = 0
    import_options: str = ""
    exec_note: str = ""
    # Lieu d'établissement du rapport (ex. Niamey), utilisé dans le bloc signature.
    location: str = ""
    # Identité de l'exportateur (journal d'audit — jamais les données).
    exported_by: str = ""
    organization: str = ""


class ReportInput(BaseModel):
    branding: ReportBranding
    context: ReportContext
    sections: list[ReportSection]


@app.post("/api/py/report/pdf")
def api_report_pdf(payload: ReportInput) -> Response:
    """
    Rapport PDF premium : page de garde, sommaire, résumé exécutif, une
    section par analyse, méthodologie, annexes. Rendu HTML/CSS → PDF
    (WeasyPrint). Sans état : le PDF part dans la réponse, rien n'est stocké.
    """
    try:
        pdf = render_pdf(payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except PdfEngineUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    filename = f"rapport-statys-{datetime.date.today().isoformat()}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
