"""
Fonctions statistiques de l'analyse univariée (Phase 2).

Module séparé de index.py pour être testable unitairement (pytest) ;
le préfixe « _ » empêche Vercel d'en faire une fonction serverless.

Règles implémentées (cf. brief) :
- test de normalité : Shapiro-Wilk si n < 5000, sinon D'Agostino-Pearson ;
- statistiques descriptives complètes : tendance centrale, dispersion, position ;
- QQ-plot contre la loi normale (quantiles théoriques scipy.stats.probplot).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import stats as sps

# Seuil de bascule Shapiro-Wilk → D'Agostino-Pearson.
SHAPIRO_MAX_N = 5000
# Nombre maximal de points renvoyés pour le QQ-plot (sous-échantillonnage régulier).
QQ_MAX_POINTS = 1000
ALPHA = 0.05


def clean_values(values: list[Any]) -> np.ndarray:
    """Ne conserve que les valeurs numériques finies."""
    arr = np.asarray(
        [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)],
        dtype=float,
    )
    return arr[np.isfinite(arr)]


def _round(x: float, digits: int = 6) -> float:
    """Arrondi stable pour la sérialisation JSON (évite 0.30000000000000004)."""
    if not math.isfinite(x):
        return float("nan")
    return float(round(float(x), digits))


def descriptive_stats(x: np.ndarray) -> dict:
    """Tendance centrale, dispersion et position d'une variable quantitative."""
    n = int(x.size)
    if n == 0:
        raise ValueError("aucune valeur numérique exploitable")

    mean = float(np.mean(x))
    std = float(np.std(x, ddof=1)) if n > 1 else 0.0
    q1, median, q3 = (float(q) for q in np.percentile(x, [25, 50, 75]))
    p10, p90 = (float(q) for q in np.percentile(x, [10, 90]))

    mode_result = sps.mode(x, keepdims=False)
    # Le mode n'est informatif que si la valeur apparaît plus d'une fois.
    mode = float(mode_result.mode) if int(mode_result.count) > 1 else None

    return {
        "n": n,
        "central": {
            "mean": _round(mean),
            "median": _round(median),
            "mode": _round(mode) if mode is not None else None,
        },
        "dispersion": {
            "std": _round(std),
            "variance": _round(std**2),
            "iqr": _round(q3 - q1),
            "range": _round(float(np.max(x) - np.min(x))),
            # Coefficient de variation non défini si la moyenne est (quasi) nulle.
            "cv": _round(std / abs(mean)) if abs(mean) > 1e-12 else None,
        },
        "position": {
            "min": _round(float(np.min(x))),
            "max": _round(float(np.max(x))),
            "q1": _round(q1),
            "q3": _round(q3),
            "p10": _round(p10),
            "p90": _round(p90),
            "skewness": _round(float(sps.skew(x, bias=False))) if n > 2 else None,
            "kurtosis": _round(float(sps.kurtosis(x, bias=False))) if n > 3 else None,
        },
    }


def normality_test(x: np.ndarray) -> dict | None:
    """
    Test de normalité avec sélection automatique :
    Shapiro-Wilk (3 ≤ n < 5000), D'Agostino-Pearson (n ≥ 5000, requiert n ≥ 20).
    Retourne None si l'échantillon est trop petit ou constant.
    """
    n = int(x.size)
    if n < 3 or float(np.std(x)) == 0.0:
        return None

    if n < SHAPIRO_MAX_N:
        stat, pvalue = sps.shapiro(x)
        test_name = "Shapiro-Wilk"
        reason = f"n = {n} < {SHAPIRO_MAX_N}"
    else:
        stat, pvalue = sps.normaltest(x)
        test_name = "D'Agostino-Pearson"
        reason = f"n = {n} ≥ {SHAPIRO_MAX_N} (Shapiro-Wilk non fiable à cette taille)"

    return {
        "test": test_name,
        "reason": reason,
        "statistic": _round(float(stat)),
        "pvalue": float(pvalue),
        "alpha": ALPHA,
        "normal": bool(pvalue > ALPHA),
    }


def qq_plot_data(x: np.ndarray) -> dict | None:
    """
    Quantiles théoriques (loi normale) vs quantiles observés, avec la droite
    de Henry ajustée. Sous-échantillonne régulièrement au-delà de QQ_MAX_POINTS.
    """
    if int(x.size) < 3:
        return None

    (theoretical, ordered), (slope, intercept, r) = sps.probplot(x, dist="norm")

    if theoretical.size > QQ_MAX_POINTS:
        idx = np.linspace(0, theoretical.size - 1, QQ_MAX_POINTS).round().astype(int)
        theoretical, ordered = theoretical[idx], ordered[idx]

    return {
        "theoretical": [_round(float(v)) for v in theoretical],
        "sample": [_round(float(v)) for v in ordered],
        "slope": _round(float(slope)),
        "intercept": _round(float(intercept)),
        "r_squared": _round(float(r) ** 2),
    }


def interpret_numeric(stats_block: dict, normality: dict | None) -> str:
    """Phrase d'interprétation générée automatiquement (reprise dans le rapport PDF)."""
    parts: list[str] = []

    if normality is not None:
        if normality["normal"]:
            parts.append(
                f"Le test de {normality['test']} ne rejette pas l'hypothèse de normalité "
                f"(p = {normality['pvalue']:.3g} > {normality['alpha']})."
            )
        else:
            parts.append(
                f"La distribution s'écarte significativement de la loi normale "
                f"selon le test de {normality['test']} (p = {normality['pvalue']:.3g} ≤ {normality['alpha']})."
            )
    else:
        parts.append("Échantillon trop petit ou constant : test de normalité non applicable.")

    skew = stats_block["position"]["skewness"]
    if skew is not None:
        if skew > 1:
            parts.append("La distribution est fortement étalée vers la droite (asymétrie positive).")
        elif skew < -1:
            parts.append("La distribution est fortement étalée vers la gauche (asymétrie négative).")
        elif abs(skew) > 0.5:
            parts.append("La distribution présente une asymétrie modérée.")
        else:
            parts.append("La distribution est approximativement symétrique.")

    return " ".join(parts)


def univariate_numeric(values: list[Any]) -> dict:
    """Analyse univariée complète d'une variable quantitative."""
    x = clean_values(values)
    if x.size == 0:
        raise ValueError("aucune valeur numérique exploitable")

    stats_block = descriptive_stats(x)
    normality = normality_test(x)
    return {
        "stats": stats_block,
        "normality": normality,
        "qq": qq_plot_data(x),
        "interpretation": interpret_numeric(stats_block, normality),
        "excluded": len(values) - int(x.size),
    }
