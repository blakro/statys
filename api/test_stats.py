"""
Tests unitaires du moteur statistique univarié.

Vérifie la cohérence des résultats sur des cas connus :
    cd web && .venv/bin/python -m pytest api/test_stats.py -q
"""

import math

import numpy as np
import pytest

from _stats import (
    SHAPIRO_MAX_N,
    clean_values,
    descriptive_stats,
    normality_test,
    qq_plot_data,
    univariate_numeric,
)


class TestCleanValues:
    def test_filtre_non_numeriques_et_nan(self):
        x = clean_values([1, 2.5, None, float("nan"), float("inf"), True])
        # True est un booléen, pas un nombre exploitable ; inf et nan sont exclus.
        assert x.tolist() == [1.0, 2.5]


class TestDescriptiveStats:
    def test_cas_connu(self):
        # Valeurs simples vérifiables à la main.
        result = descriptive_stats(np.array([2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]))
        assert result["n"] == 8
        assert result["central"]["mean"] == 5.0
        assert result["central"]["median"] == 4.5
        assert result["central"]["mode"] == 4.0
        # Écart-type échantillon (ddof=1) : sqrt(32/7).
        assert result["dispersion"]["std"] == pytest.approx(math.sqrt(32 / 7), abs=1e-6)
        assert result["position"]["min"] == 2.0
        assert result["position"]["max"] == 9.0
        assert result["dispersion"]["range"] == 7.0

    def test_mode_absent_si_valeurs_uniques(self):
        result = descriptive_stats(np.array([1.0, 2.0, 3.0]))
        assert result["central"]["mode"] is None

    def test_cv_indefini_si_moyenne_nulle(self):
        result = descriptive_stats(np.array([-1.0, 0.0, 1.0]))
        assert result["dispersion"]["cv"] is None

    def test_serie_vide_rejetee(self):
        with pytest.raises(ValueError):
            descriptive_stats(np.array([]))


class TestNormalityTest:
    def test_shapiro_pour_petit_echantillon(self):
        rng = np.random.default_rng(42)
        result = normality_test(rng.normal(size=200))
        assert result["test"] == "Shapiro-Wilk"
        assert result["normal"] is True

    def test_dagostino_au_dela_du_seuil(self):
        rng = np.random.default_rng(42)
        result = normality_test(rng.normal(size=SHAPIRO_MAX_N + 100))
        assert result["test"] == "D'Agostino-Pearson"
        assert result["normal"] is True

    def test_rejette_une_distribution_exponentielle(self):
        rng = np.random.default_rng(42)
        result = normality_test(rng.exponential(size=500))
        assert result["normal"] is False
        assert result["pvalue"] <= 0.05

    def test_non_applicable_si_constant_ou_trop_petit(self):
        assert normality_test(np.array([3.0, 3.0, 3.0, 3.0])) is None
        assert normality_test(np.array([1.0, 2.0])) is None


class TestQqPlot:
    def test_droite_parfaite_pour_donnees_lineaires(self):
        # probplot d'un échantillon normal : R² proche de 1.
        rng = np.random.default_rng(7)
        result = qq_plot_data(rng.normal(loc=10, scale=2, size=300))
        assert result["r_squared"] > 0.98
        assert result["slope"] == pytest.approx(2.0, rel=0.15)
        assert result["intercept"] == pytest.approx(10.0, rel=0.05)
        assert len(result["theoretical"]) == len(result["sample"])

    def test_sous_echantillonnage(self):
        rng = np.random.default_rng(7)
        result = qq_plot_data(rng.normal(size=5000))
        assert len(result["theoretical"]) == 1000


class TestUnivariateNumeric:
    def test_analyse_complete(self):
        rng = np.random.default_rng(1)
        values = list(rng.normal(loc=100, scale=15, size=400)) + [None, None]
        result = univariate_numeric(values)
        assert result["stats"]["n"] == 400
        assert result["excluded"] == 2
        assert result["normality"]["test"] == "Shapiro-Wilk"
        assert result["qq"] is not None
        assert "normalité" in result["interpretation"] or "normale" in result["interpretation"]

    def test_erreur_si_aucune_valeur(self):
        with pytest.raises(ValueError):
            univariate_numeric([None, None])
