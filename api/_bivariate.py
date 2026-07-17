"""
Fonctions statistiques de l'analyse bivariée (Phase 3).

Trois familles, conformes au brief :
- quantitatif × quantitatif : Pearson / Spearman / Kendall avec p-value et
  intervalle de confiance, régression linéaire, matrice de corrélation ;
- qualitatif × quantitatif : SÉLECTION AUTOMATIQUE du test via l'arbre de
  décision (normalité par groupe → homogénéité des variances → test),
  avec taille d'effet systématique ;
- qualitatif × qualitatif : Khi-deux d'indépendance (bascule automatique sur
  Fisher exact si 2×2 avec effectif attendu < 5), V de Cramér, résidus
  standardisés ajustés par cellule.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats as sps

try:
    from api._stats import SHAPIRO_MAX_N, _round, clean_values
except ImportError:  # Exécution comme module isolé (fonction serverless Vercel).
    from _stats import SHAPIRO_MAX_N, _round, clean_values

ALPHA = 0.05
Z95 = 1.959963984540054  # quantile 97,5 % de la loi normale


# ---------------------------------------------------------------------------
# Quantitatif × Quantitatif
# ---------------------------------------------------------------------------


def _fisher_ci(r: float, n: int, se: float) -> tuple[float, float] | None:
    """IC à 95 % par transformation de Fisher (arctanh), borné à [-1, 1]."""
    if not math.isfinite(se) or abs(r) >= 1.0:
        return None
    z = math.atanh(r)
    return (math.tanh(z - Z95 * se), math.tanh(z + Z95 * se))


def correlations(x_raw: list, y_raw: list) -> dict:
    """
    Corrélations Pearson, Spearman et Kendall sur les paires complètes,
    chacune avec p-value et intervalle de confiance à 95 %, plus la droite
    de régression (moindres carrés) et son R².
    """
    pairs = [
        (a, b)
        for a, b in zip(x_raw, y_raw)
        if isinstance(a, (int, float)) and not isinstance(a, bool) and math.isfinite(a)
        and isinstance(b, (int, float)) and not isinstance(b, bool) and math.isfinite(b)
    ]
    n = len(pairs)
    if n < 3:
        raise ValueError("moins de 3 paires complètes : corrélation impossible")
    x = np.array([p[0] for p in pairs])
    y = np.array([p[1] for p in pairs])
    if float(np.std(x)) == 0.0 or float(np.std(y)) == 0.0:
        raise ValueError("une des deux variables est constante sur les paires complètes")

    out: dict = {"n": n, "excluded": len(x_raw) - n}

    pearson = sps.pearsonr(x, y)
    ci = pearson.confidence_interval(confidence_level=0.95)
    out["pearson"] = {
        "r": _round(float(pearson.statistic)),
        "pvalue": float(pearson.pvalue),
        "ci95": [_round(float(ci.low)), _round(float(ci.high))],
    }

    rho, p_rho = sps.spearmanr(x, y)
    # IC de Bonett & Wright (2000) : SE = sqrt((1 + rho²/2) / (n - 3)).
    se_rho = math.sqrt((1 + float(rho) ** 2 / 2) / (n - 3)) if n > 3 else float("inf")
    ci_rho = _fisher_ci(float(rho), n, se_rho)
    out["spearman"] = {
        "r": _round(float(rho)),
        "pvalue": float(p_rho),
        "ci95": [_round(ci_rho[0]), _round(ci_rho[1])] if ci_rho else None,
    }

    tau, p_tau = sps.kendalltau(x, y)
    # IC approché de Fieller, Hartley & Pearson : SE = sqrt(0.437 / (n - 4)).
    se_tau = math.sqrt(0.437 / (n - 4)) if n > 4 else float("inf")
    ci_tau = _fisher_ci(float(tau), n, se_tau)
    out["kendall"] = {
        "r": _round(float(tau)),
        "pvalue": float(p_tau),
        "ci95": [_round(ci_tau[0]), _round(ci_tau[1])] if ci_tau else None,
    }

    reg = sps.linregress(x, y)
    out["regression"] = {
        "slope": _round(float(reg.slope)),
        "intercept": _round(float(reg.intercept)),
        "r_squared": _round(float(reg.rvalue) ** 2),
    }

    r = out["pearson"]["r"]
    strength = (
        "forte" if abs(r) >= 0.5 else "modérée" if abs(r) >= 0.3 else "faible" if abs(r) >= 0.1 else "négligeable"
    )
    direction = "positive" if r > 0 else "négative"
    if out["pearson"]["pvalue"] <= ALPHA:
        out["interpretation"] = (
            f"Corrélation linéaire {strength} et {direction} (r de Pearson = {r}, "
            f"p = {out['pearson']['pvalue']:.3g}), significative au seuil de 5 %. "
            f"La droite de régression explique {round(out['regression']['r_squared'] * 100, 1)} % de la variance."
        )
    else:
        out["interpretation"] = (
            f"Aucune corrélation linéaire significative au seuil de 5 % "
            f"(r de Pearson = {r}, p = {out['pearson']['pvalue']:.3g})."
        )
    return out


def correlation_matrix(columns: dict[str, list], method: str = "pearson") -> dict:
    """Matrice de corrélation (paires complètes deux à deux)."""
    if method not in ("pearson", "spearman", "kendall"):
        raise ValueError("méthode inconnue : " + method)
    names = list(columns.keys())
    if len(names) < 2:
        raise ValueError("au moins deux variables quantitatives sont nécessaires")

    arrays = {}
    for name in names:
        arr = np.array(
            [
                v if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else np.nan
                for v in columns[name]
            ],
            dtype=float,
        )
        arrays[name] = arr

    k = len(names)
    matrix = [[1.0] * k for _ in range(k)]
    pvalues = [[0.0] * k for _ in range(k)]
    for i in range(k):
        for j in range(i + 1, k):
            a, b = arrays[names[i]], arrays[names[j]]
            mask = ~(np.isnan(a) | np.isnan(b))
            if int(mask.sum()) < 3 or float(np.std(a[mask])) == 0 or float(np.std(b[mask])) == 0:
                r, p = float("nan"), float("nan")
            elif method == "pearson":
                r, p = (float(v) for v in sps.pearsonr(a[mask], b[mask]))
            elif method == "spearman":
                r, p = (float(v) for v in sps.spearmanr(a[mask], b[mask]))
            else:
                r, p = (float(v) for v in sps.kendalltau(a[mask], b[mask]))
            matrix[i][j] = matrix[j][i] = _round(r, 4)
            pvalues[i][j] = pvalues[j][i] = p
    return {"variables": names, "method": method, "matrix": matrix, "pvalues": pvalues}


# ---------------------------------------------------------------------------
# Qualitatif × Quantitatif — arbre de décision
# ---------------------------------------------------------------------------

MIN_GROUP_N = 3
MAX_GROUPS = 30


def _group_normality(x: np.ndarray) -> dict:
    """Shapiro-Wilk (ou D'Agostino-Pearson au-delà de 5000) sur un groupe."""
    if float(np.std(x)) == 0.0:
        return {"test": None, "statistic": None, "pvalue": None, "normal": False}
    if x.size < SHAPIRO_MAX_N:
        stat, p = sps.shapiro(x)
        name = "Shapiro-Wilk"
    else:
        stat, p = sps.normaltest(x)
        name = "D'Agostino-Pearson"
    return {"test": name, "statistic": _round(float(stat)), "pvalue": float(p), "normal": bool(p > ALPHA)}


def _cohen_d(a: np.ndarray, b: np.ndarray) -> float:
    """d de Cohen (écart-type poolé, échantillons indépendants)."""
    na, nb = a.size, b.size
    pooled = math.sqrt(((na - 1) * np.var(a, ddof=1) + (nb - 1) * np.var(b, ddof=1)) / (na + nb - 2))
    if pooled == 0:
        return 0.0
    return float((np.mean(a) - np.mean(b)) / pooled)


def _welch_anova(groups: list[np.ndarray]) -> tuple[float, float, float, float]:
    """ANOVA de Welch (1951). Retourne (F, df1, df2, p)."""
    k = len(groups)
    w = np.array([g.size / np.var(g, ddof=1) for g in groups])
    means = np.array([float(np.mean(g)) for g in groups])
    W = float(w.sum())
    mean_w = float((w * means).sum() / W)
    A = float((w * (means - mean_w) ** 2).sum()) / (k - 1)
    h = np.array([(1 - w[j] / W) ** 2 / (groups[j].size - 1) for j in range(k)])
    H = float(h.sum())
    B = 1 + (2 * (k - 2) / (k**2 - 1)) * H
    F = A / B
    df1 = k - 1
    df2 = (k**2 - 1) / (3 * H)
    p = float(sps.f.sf(F, df1, df2))
    return F, df1, df2, p


def _effect_label(name: str, value: float) -> str:
    """Qualification conventionnelle (Cohen) de la taille d'effet."""
    v = abs(value)
    if name == "d de Cohen":
        levels = (0.2, 0.5, 0.8)
    elif name in ("êta carré (η²)", "epsilon carré (ε²)"):
        levels = (0.01, 0.06, 0.14)
    else:  # corrélation bisériale de rang
        levels = (0.1, 0.3, 0.5)
    if v < levels[0]:
        return "négligeable"
    if v < levels[1]:
        return "petit"
    if v < levels[2]:
        return "moyen"
    return "grand"


def categorical_numeric(groups_in: dict[str, list], include_ks: bool = False) -> dict:
    """
    Comparaison d'une variable quantitative entre les modalités d'une variable
    qualitative, avec sélection automatique du test :

    | Modalités | Normalité | Variances homogènes | Test                    |
    |-----------|-----------|---------------------|-------------------------|
    | 2         | oui       | oui                 | t de Student            |
    | 2         | oui       | non                 | t de Welch              |
    | 2         | non       | —                   | Mann-Whitney            |
    | > 2       | oui       | oui                 | ANOVA à un facteur      |
    | > 2       | oui       | non                 | ANOVA de Welch          |
    | > 2       | non       | —                   | Kruskal-Wallis          |
    """
    if len(groups_in) > MAX_GROUPS:
        raise ValueError(f"trop de modalités ({len(groups_in)} > {MAX_GROUPS})")

    groups: dict[str, np.ndarray] = {}
    dropped: list[str] = []
    for label, values in groups_in.items():
        x = clean_values(values)
        if x.size >= MIN_GROUP_N:
            groups[label] = x
        else:
            dropped.append(label)
    if len(groups) < 2:
        raise ValueError("au moins deux groupes d'au moins 3 valeurs sont nécessaires")

    labels = list(groups.keys())
    arrays = [groups[label] for label in labels]
    k = len(labels)
    n_total = int(sum(a.size for a in arrays))

    # Statistiques par groupe (avec IC à 95 % sur la moyenne, loi de Student).
    group_stats = []
    for label, x in groups.items():
        m = float(np.mean(x))
        s = float(np.std(x, ddof=1))
        half = float(sps.t.ppf(0.975, x.size - 1)) * s / math.sqrt(x.size)
        group_stats.append(
            {
                "label": label,
                "n": int(x.size),
                "mean": _round(m),
                "median": _round(float(np.median(x))),
                "std": _round(s),
                "ci95": [_round(m - half), _round(m + half)],
            }
        )

    # 1. Normalité dans chaque groupe.
    normality = {label: _group_normality(groups[label]) for label in labels}
    all_normal = all(v["normal"] for v in normality.values())

    # 2. Homogénéité des variances : Levene (Brown-Forsythe, robuste) ;
    #    Bartlett en information complémentaire si toutes les distributions sont normales.
    lev_stat, lev_p = sps.levene(*arrays, center="median")
    homogeneity = {
        "levene": {"statistic": _round(float(lev_stat)), "pvalue": float(lev_p), "homogeneous": bool(lev_p > ALPHA)},
        "bartlett": None,
    }
    if all_normal:
        bar_stat, bar_p = sps.bartlett(*arrays)
        homogeneity["bartlett"] = {
            "statistic": _round(float(bar_stat)),
            "pvalue": float(bar_p),
            "homogeneous": bool(bar_p > ALPHA),
        }
    homogeneous = homogeneity["levene"]["homogeneous"]

    # 3. Sélection et exécution du test.
    effect: dict
    if k == 2:
        a, b = arrays
        if all_normal and homogeneous:
            stat, p = sps.ttest_ind(a, b, equal_var=True)
            test = {
                "name": "t de Student (échantillons indépendants)",
                "statistic": _round(float(stat)),
                "pvalue": float(p),
                "df": _round(float(a.size + b.size - 2), 2),
            }
        elif all_normal:
            res = sps.ttest_ind(a, b, equal_var=False)
            stat, p = float(res.statistic), float(res.pvalue)
            test = {
                "name": "t de Welch",
                "statistic": _round(stat),
                "pvalue": p,
                "df": _round(float(res.df), 2),
            }
        else:
            stat, p = sps.mannwhitneyu(a, b, alternative="two-sided")
            test = {"name": "Mann-Whitney (rank-sum)", "statistic": _round(float(stat)), "pvalue": float(p), "df": None}

        if all_normal:
            d = _cohen_d(a, b)
            effect = {"name": "d de Cohen", "value": _round(d)}
        else:
            u = float(sps.mannwhitneyu(a, b, alternative="two-sided").statistic)
            rbc = 1 - 2 * u / (a.size * b.size)  # corrélation bisériale de rang
            effect = {"name": "corrélation bisériale de rang", "value": _round(float(rbc))}
    else:
        if all_normal and homogeneous:
            stat, p = sps.f_oneway(*arrays)
            test = {
                "name": "ANOVA à un facteur",
                "statistic": _round(float(stat)),
                "pvalue": float(p),
                "df": f"({k - 1}, {n_total - k})",
            }
        elif all_normal:
            F, df1, df2, p = _welch_anova(arrays)
            test = {
                "name": "ANOVA de Welch",
                "statistic": _round(F),
                "pvalue": p,
                "df": f"({df1}, {_round(df2, 1)})",
            }
        else:
            stat, p = sps.kruskal(*arrays)
            test = {
                "name": "Kruskal-Wallis",
                "statistic": _round(float(stat)),
                "pvalue": float(p),
                "df": k - 1,
            }

        if all_normal:
            # êta carré = SS_inter / SS_total.
            grand_mean = float(np.concatenate(arrays).mean())
            ss_between = sum(a.size * (float(np.mean(a)) - grand_mean) ** 2 for a in arrays)
            ss_total = float(((np.concatenate(arrays) - grand_mean) ** 2).sum())
            effect = {"name": "êta carré (η²)", "value": _round(ss_between / ss_total if ss_total > 0 else 0.0)}
        else:
            H = float(sps.kruskal(*arrays).statistic)
            eps2 = (H - k + 1) / (n_total - k)
            effect = {"name": "epsilon carré (ε²)", "value": _round(max(0.0, eps2))}

    effect["magnitude"] = _effect_label(effect["name"], effect["value"])

    # Test de Kolmogorov-Smirnov à deux échantillons (option, 2 groupes).
    ks = None
    if include_ks and k == 2:
        ks_stat, ks_p = sps.ks_2samp(arrays[0], arrays[1])
        ks = {"statistic": _round(float(ks_stat)), "pvalue": float(ks_p), "different": bool(ks_p <= ALPHA)}

    significant = test["pvalue"] <= ALPHA
    interpretation = (
        f"{'Différence significative' if significant else 'Aucune différence significative'} "
        f"entre les {k} groupes selon le test « {test['name']} » "
        f"(p = {test['pvalue']:.3g}) ; taille d'effet {effect['name']} = {effect['value']} "
        f"({effect['magnitude']})."
    )

    return {
        "groups": group_stats,
        "dropped_groups": dropped,
        "assumptions": {
            "normality": normality,
            "all_normal": all_normal,
            "homogeneity": homogeneity,
            "homogeneous": homogeneous,
        },
        "decision": {
            "n_groups": k,
            "path": [
                f"{k} modalités",
                "distributions normales dans chaque groupe" if all_normal else "au moins un groupe non normal",
                (
                    "variances homogènes (Levene)"
                    if homogeneous
                    else "variances non homogènes (Levene)"
                )
                if all_normal
                else "homogénéité non requise (voie non paramétrique)",
            ],
        },
        "test": test,
        "effect_size": effect,
        "ks": ks,
        "interpretation": interpretation,
    }


# ---------------------------------------------------------------------------
# Qualitatif × Qualitatif
# ---------------------------------------------------------------------------


def categorical_categorical(observed: list[list[int]], row_labels: list[str], col_labels: list[str]) -> dict:
    """
    Test d'indépendance sur un tableau de contingence : Khi-deux, avec bascule
    automatique sur Fisher exact si le tableau est 2×2 et qu'un effectif
    attendu est < 5. V de Cramér et résidus standardisés ajustés par cellule.
    """
    table = np.asarray(observed, dtype=float)
    if table.ndim != 2 or table.shape[0] < 2 or table.shape[1] < 2:
        raise ValueError("le tableau de contingence doit être au moins 2×2")
    if table.sum() == 0:
        raise ValueError("tableau vide")

    n = float(table.sum())
    r, c = table.shape

    chi2_res = sps.chi2_contingency(table, correction=(r == 2 and c == 2))
    expected = np.asarray(chi2_res.expected_freq)
    min_expected = float(expected.min())

    is_2x2 = r == 2 and c == 2
    use_fisher = is_2x2 and min_expected < 5

    if use_fisher:
        odds, p = sps.fisher_exact(table.astype(int))
        test = {
            "name": "Test exact de Fisher",
            "reason": f"tableau 2×2 avec un effectif attendu minimal de {_round(min_expected, 2)} < 5",
            "statistic": _round(float(odds)),
            "statistic_label": "odds ratio",
            "pvalue": float(p),
            "df": None,
        }
    else:
        warning = None
        if min_expected < 5:
            warning = (
                "Attention : certains effectifs attendus sont < 5 ; "
                "le Khi-deux peut être peu fiable (envisagez de regrouper des modalités)."
            )
        test = {
            "name": "Khi-deux d'indépendance" + (" (correction de Yates)" if is_2x2 else ""),
            "reason": None,
            "statistic": _round(float(chi2_res.statistic)),
            "statistic_label": "χ²",
            "pvalue": float(chi2_res.pvalue),
            "df": int(chi2_res.dof),
            "warning": warning,
        }

    # V de Cramér, calculé sur le χ² sans correction (pratique usuelle).
    chi2_plain = sps.chi2_contingency(table, correction=False)
    v = math.sqrt(float(chi2_plain.statistic) / (n * (min(r, c) - 1)))

    # Résidus standardisés ajustés (Haberman) : ~N(0,1) sous indépendance,
    # |résidu| > 2 signale une cellule qui porte l'association.
    row_p = table.sum(axis=1, keepdims=True) / n
    col_p = table.sum(axis=0, keepdims=True) / n
    with np.errstate(divide="ignore", invalid="ignore"):
        residuals = (table - expected) / np.sqrt(expected * (1 - row_p) * (1 - col_p))
    residuals = np.nan_to_num(residuals, nan=0.0, posinf=0.0, neginf=0.0)

    significant = test["pvalue"] <= ALPHA
    magnitude = _effect_label("corrélation bisériale de rang", v)  # mêmes seuils 0,1/0,3/0,5
    strongest = None
    if significant:
        idx = np.unravel_index(np.abs(residuals).argmax(), residuals.shape)
        strongest = {
            "row": row_labels[idx[0]],
            "col": col_labels[idx[1]],
            "residual": _round(float(residuals[idx]), 2),
        }
    interpretation = (
        f"{'Association significative' if significant else 'Aucune association significative'} "
        f"entre les deux variables ({test['name']}, p = {test['pvalue']:.3g}) ; "
        f"V de Cramér = {_round(v, 3)} ({magnitude})."
    )
    if strongest is not None:
        interpretation += (
            f" La combinaison « {strongest['row']} × {strongest['col']} » est celle qui porte "
            f"le plus l'association (résidu ajusté = {strongest['residual']})."
        )

    return {
        "test": test,
        "expected": [[_round(float(v2), 2) for v2 in row] for row in expected],
        "min_expected": _round(min_expected, 2),
        "cramer_v": _round(v, 4),
        "cramer_v_magnitude": magnitude,
        "residuals": [[_round(float(v2), 2) for v2 in row] for row in residuals],
        "interpretation": interpretation,
    }
