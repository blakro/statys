"""
Tests unitaires de l'analyse bivariée — en particulier l'arbre de décision
(le bon test choisi dans les bonnes conditions) et les tailles d'effet.

    cd web/api && ../.venv/bin/python -m pytest test_bivariate.py -q
"""

import math

import numpy as np
import pytest
from scipy import stats as sps

from _bivariate import (
    _cohen_d,
    _welch_anova,
    categorical_categorical,
    categorical_numeric,
    correlation_matrix,
    correlations,
)

rng = np.random.default_rng(42)


class TestCorrelations:
    def test_correlation_parfaite(self):
        x = list(range(1, 21))
        y = [2 * v + 1 for v in x]
        res = correlations(x, y)
        assert res["pearson"]["r"] == 1.0
        assert res["spearman"]["r"] == 1.0
        assert res["kendall"]["r"] == 1.0
        assert res["regression"]["slope"] == pytest.approx(2.0)
        assert res["regression"]["intercept"] == pytest.approx(1.0)
        assert res["regression"]["r_squared"] == pytest.approx(1.0)

    def test_ic_contient_r_et_reste_borne(self):
        x = list(rng.normal(size=100))
        y = [v * 0.5 + e for v, e in zip(x, rng.normal(size=100))]
        res = correlations(x, y)
        for key in ("pearson", "spearman", "kendall"):
            lo, hi = res[key]["ci95"]
            assert -1 <= lo <= res[key]["r"] <= hi <= 1

    def test_paires_incompletes_exclues(self):
        x = [1, 2, 3, None, 5, 6, 7, 8]
        y = [2, 4, 6, 8, None, 12, 14, 16]
        res = correlations(x, y)
        assert res["n"] == 6
        assert res["excluded"] == 2

    def test_erreurs(self):
        with pytest.raises(ValueError):
            correlations([1, 2], [1, 2])
        with pytest.raises(ValueError):
            correlations([1, 1, 1, 1], [1, 2, 3, 4])


class TestCorrelationMatrix:
    def test_symetrie_et_diagonale(self):
        res = correlation_matrix(
            {
                "a": list(rng.normal(size=50)),
                "b": list(rng.normal(size=50)),
                "c": list(rng.normal(size=50)),
            }
        )
        m = res["matrix"]
        assert all(m[i][i] == 1.0 for i in range(3))
        assert m[0][1] == m[1][0]
        assert m[0][2] == m[2][0]


class TestArbreDeDecision:
    """Vérifie que chaque branche du tableau du brief est bien empruntée."""

    def test_2_groupes_normaux_homogenes_student(self):
        g = {
            "A": list(rng.normal(10, 2, 80)),
            "B": list(rng.normal(11, 2, 80)),
        }
        res = categorical_numeric(g)
        assert res["assumptions"]["all_normal"] is True
        assert res["assumptions"]["homogeneous"] is True
        assert res["test"]["name"].startswith("t de Student")
        assert res["effect_size"]["name"] == "d de Cohen"
        # Bartlett fourni en complément quand tout est normal.
        assert res["assumptions"]["homogeneity"]["bartlett"] is not None

    def test_2_groupes_normaux_heteroscedastiques_welch(self):
        g = {
            "A": list(rng.normal(10, 1, 200)),
            "B": list(rng.normal(10.5, 6, 200)),
        }
        res = categorical_numeric(g)
        assert res["assumptions"]["all_normal"] is True
        assert res["assumptions"]["homogeneous"] is False
        assert res["test"]["name"] == "t de Welch"

    def test_2_groupes_non_normaux_mann_whitney(self):
        g = {
            "A": list(rng.exponential(1, 150)),
            "B": list(rng.exponential(2, 150)),
        }
        res = categorical_numeric(g)
        assert res["assumptions"]["all_normal"] is False
        assert res["test"]["name"].startswith("Mann-Whitney")
        assert res["effect_size"]["name"] == "corrélation bisériale de rang"

    def test_3_groupes_normaux_homogenes_anova(self):
        g = {
            "A": list(rng.normal(10, 2, 60)),
            "B": list(rng.normal(12, 2, 60)),
            "C": list(rng.normal(11, 2, 60)),
        }
        res = categorical_numeric(g)
        assert res["test"]["name"] == "ANOVA à un facteur"
        assert res["effect_size"]["name"] == "êta carré (η²)"

    def test_3_groupes_normaux_heteroscedastiques_welch_anova(self):
        g = {
            "A": list(rng.normal(10, 1, 100)),
            "B": list(rng.normal(12, 5, 100)),
            "C": list(rng.normal(11, 10, 100)),
        }
        res = categorical_numeric(g)
        assert res["assumptions"]["all_normal"] is True
        assert res["assumptions"]["homogeneous"] is False
        assert res["test"]["name"] == "ANOVA de Welch"

    def test_3_groupes_non_normaux_kruskal(self):
        g = {
            "A": list(rng.exponential(1, 100)),
            "B": list(rng.exponential(1.5, 100)),
            "C": list(rng.exponential(2, 100)),
        }
        res = categorical_numeric(g)
        assert res["test"]["name"] == "Kruskal-Wallis"
        assert res["effect_size"]["name"] == "epsilon carré (ε²)"
        assert res["effect_size"]["value"] >= 0

    def test_groupes_trop_petits_ecartes(self):
        g = {"A": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0], "B": [2.0, 3.0, 4.0, 5.0, 6.0, 7.0], "C": [1.0]}
        res = categorical_numeric(g)
        assert res["dropped_groups"] == ["C"]

    def test_ks_optionnel_2_groupes(self):
        g = {"A": list(rng.normal(0, 1, 60)), "B": list(rng.normal(3, 1, 60))}
        res = categorical_numeric(g, include_ks=True)
        assert res["ks"] is not None
        assert res["ks"]["different"] is True


class TestWelchAnova:
    def test_identite_avec_t_de_welch_pour_2_groupes(self):
        """Pour k = 2, F de Welch = t² de Welch et df2 = df de Welch (identité exacte)."""
        a = rng.normal(10, 1, 40)
        b = rng.normal(11, 4, 60)
        F, df1, df2, p = _welch_anova([a, b])
        t = sps.ttest_ind(a, b, equal_var=False)
        assert F == pytest.approx(float(t.statistic) ** 2, rel=1e-9)
        assert df2 == pytest.approx(float(t.df), rel=1e-9)
        assert p == pytest.approx(float(t.pvalue), rel=1e-6)

    def test_proche_anova_classique_si_variances_egales(self):
        groups = [rng.normal(10, 2, 500), rng.normal(10.4, 2, 500), rng.normal(10.2, 2, 500)]
        F_welch, _, _, p_welch = _welch_anova(groups)
        F_classic, p_classic = sps.f_oneway(*groups)
        assert F_welch == pytest.approx(float(F_classic), rel=0.05)
        # Les p-values très petites divergent relativement plus vite que F :
        # on vérifie qu'elles restent du même ordre de grandeur.
        assert math.log10(p_welch) == pytest.approx(math.log10(float(p_classic)), abs=0.5)


class TestCohenD:
    def test_valeur_connue(self):
        # Deux groupes d'écart-type 1 et de moyennes distantes de 1 → d ≈ 1.
        a = np.array([1.0, 2.0, 3.0])  # moyenne 2, sd 1
        b = np.array([2.0, 3.0, 4.0])  # moyenne 3, sd 1
        assert _cohen_d(a, b) == pytest.approx(-1.0)


class TestContingence:
    def test_khi_deux_cas_connu(self):
        # Exemple classique : tableau 2×2 équilibré, association nette.
        res = categorical_categorical([[30, 10], [10, 30]], ["H", "F"], ["Oui", "Non"])
        assert res["test"]["name"].startswith("Khi-deux")
        assert res["test"]["pvalue"] < 0.001
        # V de Cramér = sqrt(chi2_sans_correction / n) pour un 2×2 = |30*30-10*10|... vérif : phi = (30*30-10*10)/sqrt(40*40*40*40) = 800/1600 = 0.5
        assert res["cramer_v"] == pytest.approx(0.5, abs=1e-6)

    def test_bascule_fisher_si_attendu_faible(self):
        res = categorical_categorical([[8, 2], [1, 5]], ["A", "B"], ["X", "Y"])
        assert res["test"]["name"] == "Test exact de Fisher"
        assert res["min_expected"] < 5
        # p exact connu de ce tableau (Fisher bilatéral) ≈ 0.03497
        assert res["test"]["pvalue"] == pytest.approx(0.03497, abs=1e-4)

    def test_pas_de_fisher_pour_grand_tableau(self):
        res = categorical_categorical(
            [[10, 2, 3], [4, 12, 5], [3, 4, 11]], ["A", "B", "C"], ["X", "Y", "Z"]
        )
        assert res["test"]["name"].startswith("Khi-deux")
        assert res["test"]["df"] == 4

    def test_residus_signent_l_association(self):
        res = categorical_categorical([[30, 10], [10, 30]], ["H", "F"], ["Oui", "Non"])
        residuals = res["residuals"]
        # Sur-représentation H×Oui et F×Non → résidus positifs sur la diagonale.
        assert residuals[0][0] > 2
        assert residuals[1][1] > 2
        assert residuals[0][1] < -2

    def test_attendus_coherents(self):
        res = categorical_categorical([[20, 20], [20, 20]], ["A", "B"], ["X", "Y"])
        assert res["expected"] == [[20.0, 20.0], [20.0, 20.0]]
        assert res["test"]["pvalue"] == pytest.approx(1.0)
