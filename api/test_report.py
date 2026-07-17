"""
Tests du générateur de rapport PDF.

    cd web/api && ../.venv/bin/python -m pytest test_report.py -q
"""

import base64

import pytest

from _report import MAX_TABLE_ROWS, _safe_color, build_report_html, render_pdf

# PNG 1×1 transparent, valide.
TINY_PNG = "data:image/png;base64," + base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000d4944415478da63fcffff3f030005fe02fea72d1e480000000049454e44ae426082"
    )
).decode()


def sample_payload() -> dict:
    return {
        "branding": {
            "bank_name": "Banque de Démonstration",
            "report_title": "Portefeuille crédit T2 2026",
            "author": "A. Analyste",
            "accent_color": "#b45309",
        },
        "context": {
            "file_name": "encours.csv",
            "row_count": 900,
            "column_count": 6,
            "import_options": "délimiteur « ; », UTF-8, virgule décimale",
            "exec_note": "",
        },
        "sections": [
            {
                "kind": "univariate-numeric",
                "title": "Analyse univariée — encours_credit",
                "subtitle": "Variable quantitative, 900 valeurs",
                "interpretation": "La distribution s'écarte significativement de la loi normale.",
                "images": [{"title": "Histogramme", "data_uri": TINY_PNG}],
                "tables": [
                    {
                        "title": "Statistiques",
                        "columns": ["Indicateur", "Valeur"],
                        "rows": [["Moyenne", "9 564,18"], ["Médiane", "7 976,53"]],
                    }
                ],
            },
            {
                "kind": "bivariate-cn",
                "title": "encours_credit selon region",
                "subtitle": "",
                "interpretation": "Différence significative (Kruskal-Wallis).",
                "images": [],
                "tables": [],
            },
        ],
    }


class TestBuildHtml:
    def test_structure_complete(self):
        html = build_report_html(sample_payload())
        # Page de garde, sommaire, résumé, sections, méthodologie, annexes.
        assert "Banque de Démonstration" in html
        assert "Sommaire" in html
        assert "Résumé exécutif" in html
        assert "Analyse univariée — encours_credit" in html
        assert "Méthodologie" in html
        assert "Annexes" in html
        # La méthodologie ne contient que les blocs des analyses présentes.
        assert "sélection du test" in html  # bloc bivariate-cn
        assert "Association entre deux variables qualitatives" not in html

    def test_couleur_accent_verrouillee(self):
        assert _safe_color("#12abEF") == "#12abEF"
        assert _safe_color("red; } body { display:none") == "#416cae"
        assert _safe_color(None) == "#416cae"
        html = build_report_html(sample_payload())
        assert "#b45309" in html

    def test_echappement_html(self):
        payload = sample_payload()
        payload["branding"]["bank_name"] = "<script>alert(1)</script>"
        html = build_report_html(payload)
        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;" in html

    def test_rejette_image_non_data_uri(self):
        payload = sample_payload()
        payload["sections"][0]["images"][0]["data_uri"] = "https://exemple.fr/x.png"
        with pytest.raises(ValueError):
            build_report_html(payload)

    def test_rejette_rapport_vide(self):
        payload = sample_payload()
        payload["sections"] = []
        with pytest.raises(ValueError):
            build_report_html(payload)

    def test_tronque_les_tableaux_trop_longs(self):
        payload = sample_payload()
        payload["sections"][0]["tables"][0]["rows"] = [["x", i] for i in range(500)]
        html = build_report_html(payload)
        assert f"tronqué à {MAX_TABLE_ROWS} lignes" in html


class TestRenderPdf:
    def test_pdf_valide(self):
        pdf = render_pdf(sample_payload())
        assert pdf[:5] == b"%PDF-"
        assert len(pdf) > 10_000  # document multi-pages, pas un stub
