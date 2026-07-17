"""
Génération du rapport PDF premium (Phase 4).

Rendu HTML/CSS → PDF via WeasyPrint (pas de ReportLab brut). Les graphiques
arrivent du navigateur en PNG (data URI) : ils sont capturés côté client par
Plotly, ce qui garantit des figures identiques à l'écran sans embarquer de
moteur de rendu graphique dans la fonction serverless.

Structure du document : page de garde (branding banque), sommaire, résumé
exécutif, une section par analyse (graphique + tableau + interprétation),
méthodologie (tests utilisés et pourquoi), annexes.

L'API reste sans état : le PDF est renvoyé dans la réponse, rien n'est écrit
sur disque. Un événement d'audit minimal (horodatage, volumétrie — jamais les
données) est émis sur stdout.
"""

from __future__ import annotations

import base64
import datetime
import json
import re
import sys

from jinja2 import Environment, BaseLoader, select_autoescape

MAX_SECTIONS = 40
MAX_IMAGES_PER_SECTION = 4
MAX_IMAGE_BYTES = 2_000_000
MAX_TABLE_ROWS = 100

DATA_URI_RE = re.compile(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$")

MONTHS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

#: Blocs de méthodologie, inclus selon les types d'analyses présents.
METHODOLOGY: dict[str, dict[str, str]] = {
    "univariate-numeric": {
        "title": "Analyse univariée d'une variable quantitative",
        "body": (
            "Les statistiques descriptives couvrent la tendance centrale (moyenne, médiane, mode), "
            "la dispersion (écart-type et variance calculés sur l'échantillon, écart interquartile, "
            "étendue, coefficient de variation) et la position (quartiles, percentiles P10/P90, "
            "asymétrie et aplatissement corrigés du biais). La normalité est testée par Shapiro-Wilk "
            "lorsque n < 5 000 ; au-delà, le test de D'Agostino-Pearson est utilisé, Shapiro-Wilk "
            "n'étant plus fiable à cette taille. Le QQ-plot confronte les quantiles observés aux "
            "quantiles théoriques de la loi normale (droite de Henry)."
        ),
    },
    "univariate-categorical": {
        "title": "Analyse univariée d'une variable qualitative",
        "body": (
            "Les modalités sont décrites par leurs effectifs, fréquences relatives et fréquences "
            "cumulées, les valeurs manquantes étant traitées comme une catégorie à part. La "
            "représentation suit la règle : camembert en dessous de 4 modalités, diagramme en "
            "barres trié par fréquence décroissante au-delà."
        ),
    },
    "bivariate-nn": {
        "title": "Corrélation entre deux variables quantitatives",
        "body": (
            "Trois coefficients sont rapportés : Pearson (relation linéaire), Spearman (relation "
            "monotone, sur les rangs) et le tau de Kendall (concordance des paires). Chacun est "
            "accompagné de sa p-value et d'un intervalle de confiance à 95 % obtenu par "
            "transformation de Fisher (approximations de Bonett-Wright pour Spearman et de "
            "Fieller-Hartley-Pearson pour Kendall). La droite de régression est ajustée par "
            "moindres carrés ordinaires ; le R² mesure la part de variance expliquée."
        ),
    },
    "bivariate-cn": {
        "title": "Comparaison d'une variable quantitative entre groupes — sélection du test",
        "body": (
            "Le test est sélectionné automatiquement selon les conditions vérifiées : "
            "1) normalité de la variable quantitative dans chaque groupe (Shapiro-Wilk, ou "
            "D'Agostino-Pearson si n ≥ 5 000) ; 2) homogénéité des variances entre groupes "
            "(test de Levene dans sa variante robuste de Brown-Forsythe, complété par Bartlett "
            "lorsque toutes les distributions sont normales). Deux groupes : t de Student si "
            "normalité et variances homogènes, t de Welch si normalité sans homogénéité, "
            "Mann-Whitney sinon. Plus de deux groupes : ANOVA à un facteur, ANOVA de Welch, ou "
            "Kruskal-Wallis selon les mêmes conditions. Une taille d'effet est systématiquement "
            "rapportée (d de Cohen, êta carré, epsilon carré ou corrélation bisériale de rang) : "
            "une p-value seule ne mesure pas l'ampleur d'un écart."
        ),
    },
    "bivariate-cc": {
        "title": "Association entre deux variables qualitatives",
        "body": (
            "L'indépendance est testée par le Khi-deux (avec correction de Yates pour les tableaux "
            "2×2). Lorsque le tableau est 2×2 et qu'au moins un effectif attendu est inférieur à 5, "
            "le test exact de Fisher est appliqué à la place, le Khi-deux n'étant plus valide. "
            "Le V de Cramér quantifie l'intensité de l'association ; les résidus standardisés "
            "ajustés (Haberman) identifient les combinaisons de modalités qui la portent "
            "(|résidu| > 2 ≈ écart significatif à l'indépendance)."
        ),
    },
    "correlation-matrix": {
        "title": "Matrice de corrélation",
        "body": (
            "Les corrélations sont calculées deux à deux sur les paires d'observations complètes "
            "(suppression par paire des valeurs manquantes), selon la méthode indiquée dans la "
            "section concernée."
        ),
    },
}

TEMPLATE = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @page {
    size: A4;
    margin: 22mm 18mm 20mm 18mm;
    @bottom-left { content: "{{ branding.bank_name }} — {{ branding.report_title }}"; font-size: 7.5pt; color: #64748b; }
    @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 7.5pt; color: #64748b; }
  }
  @page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }

  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", "Helvetica Neue", Arial, sans-serif; color: #1e293b; font-size: 9.5pt; line-height: 1.55; }

  /* ---- Page de garde ---- */
  .cover { page: cover; height: 297mm; background: #0f1c2e; color: #fff; padding: 30mm 24mm; position: relative; }
  .cover .band { position: absolute; top: 0; left: 0; width: 8mm; height: 297mm; background: {{ branding.accent_color }}; }
  .cover .brand { font-size: 11pt; letter-spacing: 0.15em; text-transform: uppercase; color: #94b0d8; }
  .cover h1 { font-size: 26pt; line-height: 1.25; margin: 60mm 0 6mm 0; font-weight: 700; }
  .cover .subtitle { font-size: 12pt; color: #bfcfe8; }
  .cover .meta { position: absolute; bottom: 30mm; left: 24mm; right: 24mm; border-top: 0.5pt solid #416cae; padding-top: 6mm; font-size: 9.5pt; color: #dce5f3; }
  .cover .meta div { margin-bottom: 1.5mm; }
  .cover .confidential { display: inline-block; margin-top: 4mm; padding: 1.5mm 3.5mm; border: 0.5pt solid #94b0d8; border-radius: 2mm; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; }

  /* ---- Typographie générale ---- */
  h2 { font-size: 14pt; color: #0f1c2e; border-bottom: 2pt solid {{ branding.accent_color }}; padding-bottom: 2mm; margin: 0 0 5mm 0; page-break-after: avoid; }
  h3 { font-size: 10.5pt; color: #233354; margin: 5mm 0 2mm 0; page-break-after: avoid; }
  p { margin: 0 0 3mm 0; }
  .section { page-break-before: always; }
  .muted { color: #64748b; font-size: 8.5pt; }

  /* ---- Sommaire ---- */
  .toc { page-break-before: always; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { margin-bottom: 2.5mm; font-size: 10pt; }
  .toc a { color: #1e293b; text-decoration: none; }
  .toc a::after { content: leader(". ") target-counter(attr(href), page); color: #64748b; }

  /* ---- Résumé exécutif ---- */
  .exec { page-break-before: always; }
  .exec ul { padding-left: 5mm; }
  .exec li { margin-bottom: 2.5mm; }

  /* ---- Sections d'analyse ---- */
  .interpretation { background: #f0f4fa; border-left: 3pt solid {{ branding.accent_color }}; padding: 3mm 4mm; margin: 4mm 0; page-break-inside: avoid; }
  .interpretation .label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #416cae; margin-bottom: 1mm; }
  figure { margin: 4mm 0; page-break-inside: avoid; text-align: center; }
  figure img { max-width: 100%; max-height: 95mm; }
  figcaption { font-size: 8pt; color: #64748b; margin-top: 1mm; }

  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm 0; font-size: 8.5pt; page-break-inside: auto; }
  th { background: #f1f5f9; color: #334155; text-align: left; font-weight: 600; padding: 1.8mm 2.5mm; border-bottom: 1pt solid #cbd5e1; }
  td { padding: 1.6mm 2.5mm; border-bottom: 0.5pt solid #e2e8f0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr { page-break-inside: avoid; }

  .methodology, .annexes { page-break-before: always; }
  .methodology h3 { margin-top: 6mm; }
</style>
</head>
<body>

<div class="cover">
  <div class="band"></div>
  <div class="brand">{{ branding.bank_name }}</div>
  <h1>{{ branding.report_title }}</h1>
  <div class="subtitle">Rapport d'analyse statistique</div>
  <div class="meta">
    {% if branding.author %}<div>Préparé par : {{ branding.author }}</div>{% endif %}
    <div>Date : {{ generated_date }}</div>
    <div>Source : {{ context.file_name }} — {{ context.row_count }} lignes, {{ context.column_count }} colonnes</div>
    <div class="confidential">Document confidentiel — usage interne</div>
  </div>
</div>

<div class="toc">
  <h2>Sommaire</h2>
  <ol>
    <li><a href="#exec">1. Résumé exécutif</a></li>
    {% for s in sections %}
    <li><a href="#s{{ loop.index }}">{{ loop.index + 1 }}. {{ s.title }}</a></li>
    {% endfor %}
    <li><a href="#methodology">{{ sections|length + 2 }}. Méthodologie</a></li>
    <li><a href="#annexes">{{ sections|length + 3 }}. Annexes</a></li>
  </ol>
</div>

<div class="exec" id="exec">
  <h2>1. Résumé exécutif</h2>
  {% if context.exec_note %}<p>{{ context.exec_note }}</p>{% endif %}
  <p>Ce rapport présente {{ sections|length }} analyse{{ "s" if sections|length > 1 else "" }}
  réalisée{{ "s" if sections|length > 1 else "" }} sur le jeu de données
  « {{ context.file_name }} » ({{ context.row_count }} lignes). Les tests statistiques ont été
  sélectionnés automatiquement selon les conditions vérifiées sur les données (normalité,
  homogénéité des variances, effectifs attendus) — le détail figure en méthodologie.</p>
  <ul>
    {% for s in sections %}
    <li><strong>{{ s.title }}</strong>{% if s.interpretation %} — {{ s.interpretation }}{% endif %}</li>
    {% endfor %}
  </ul>
</div>

{% for s in sections %}
<div class="section" id="s{{ loop.index }}">
  <h2>{{ loop.index + 1 }}. {{ s.title }}</h2>
  {% if s.subtitle %}<p class="muted">{{ s.subtitle }}</p>{% endif %}
  {% if s.interpretation %}
  <div class="interpretation">
    <div class="label">Interprétation</div>
    {{ s.interpretation }}
  </div>
  {% endif %}
  {% for img in s.images %}
  <figure>
    <img src="{{ img.data_uri }}" alt="{{ img.title }}">
    <figcaption>{{ img.title }}</figcaption>
  </figure>
  {% endfor %}
  {% for t in s.tables %}
  {% if t.title %}<h3>{{ t.title }}</h3>{% endif %}
  <table>
    <thead>
      <tr>{% for c in t.columns %}<th {% if not loop.first %}class="num"{% endif %}>{{ c }}</th>{% endfor %}</tr>
    </thead>
    <tbody>
      {% for row in t.rows %}
      <tr>{% for cell in row %}<td {% if not loop.first %}class="num"{% endif %}>{{ cell }}</td>{% endfor %}</tr>
      {% endfor %}
    </tbody>
  </table>
  {% endfor %}
</div>
{% endfor %}

<div class="methodology" id="methodology">
  <h2>{{ sections|length + 2 }}. Méthodologie</h2>
  <p>Les analyses ont été produites par la plateforme Statys. Les données importées restent en
  mémoire dans le navigateur de l'analyste pendant la session : elles ne sont ni stockées ni
  conservées côté serveur ; seules les valeurs strictement nécessaires à chaque calcul sont
  transmises au moteur statistique, qui répond sans rien écrire.</p>
  {% for m in methodology %}
  <h3>{{ m.title }}</h3>
  <p>{{ m.body }}</p>
  {% endfor %}
  <h3>Seuil de signification</h3>
  <p>Sauf mention contraire, les tests sont interprétés au seuil α = 5 %. Les intervalles de
  confiance sont donnés au niveau de 95 %.</p>
</div>

<div class="annexes" id="annexes">
  <h2>{{ sections|length + 3 }}. Annexes</h2>
  <h3>Contexte technique</h3>
  <table>
    <thead><tr><th>Paramètre</th><th class="num">Valeur</th></tr></thead>
    <tbody>
      <tr><td>Fichier source</td><td class="num">{{ context.file_name }}</td></tr>
      <tr><td>Lignes</td><td class="num">{{ context.row_count }}</td></tr>
      <tr><td>Colonnes</td><td class="num">{{ context.column_count }}</td></tr>
      {% if context.import_options %}<tr><td>Options d'import</td><td class="num">{{ context.import_options }}</td></tr>{% endif %}
      <tr><td>Moteur statistique</td><td class="num">Python {{ versions.python }} — scipy {{ versions.scipy }}</td></tr>
      <tr><td>Généré le</td><td class="num">{{ generated_date }}</td></tr>
      {% if context.exported_by %}<tr><td>Exporté par</td><td class="num">{{ context.exported_by }}{% if context.organization %} ({{ context.organization }}){% endif %}</td></tr>{% endif %}
    </tbody>
  </table>
  <p class="muted">Reproductibilité : les résultats dépendent uniquement du fichier source et des
  options d'import listées ci-dessus. Aucune donnée individuelle n'est conservée avec ce rapport.</p>
</div>

</body>
</html>
"""


def _validate_image(data_uri: str) -> None:
    m = DATA_URI_RE.match(data_uri)
    if not m:
        raise ValueError("image invalide : seuls les data URI PNG/JPEG sont acceptés")
    approx_bytes = len(m.group(2)) * 3 // 4
    if approx_bytes > MAX_IMAGE_BYTES:
        raise ValueError("image trop volumineuse (2 Mo max)")
    # Vérifie que le base64 est décodable.
    base64.b64decode(m.group(2), validate=False)


def build_report_html(payload: dict) -> str:
    """Valide le payload et rend le HTML complet du rapport."""
    sections = payload.get("sections") or []
    if not sections:
        raise ValueError("aucune section : effectuez au moins une analyse avant l'export")
    if len(sections) > MAX_SECTIONS:
        raise ValueError(f"trop de sections ({len(sections)} > {MAX_SECTIONS})")
    for s in sections:
        images = s.get("images") or []
        if len(images) > MAX_IMAGES_PER_SECTION:
            raise ValueError("trop d'images dans une section")
        for img in images:
            _validate_image(img["data_uri"])
        for t in s.get("tables") or []:
            if len(t.get("rows") or []) > MAX_TABLE_ROWS:
                t["rows"] = t["rows"][:MAX_TABLE_ROWS]
                t["title"] = (t.get("title") or "") + f" (tronqué à {MAX_TABLE_ROWS} lignes)"

    kinds = {s.get("kind") for s in sections}
    methodology = [METHODOLOGY[k] for k in METHODOLOGY if k in kinds]

    import platform

    import scipy

    now = datetime.date.today()
    generated_date = f"{now.day} {MONTHS_FR[now.month - 1]} {now.year}"

    branding = payload.get("branding") or {}
    branding = {
        "bank_name": branding.get("bank_name") or "Établissement",
        "report_title": branding.get("report_title") or "Analyse statistique",
        "author": branding.get("author") or "",
        "accent_color": _safe_color(branding.get("accent_color")),
    }

    env = Environment(loader=BaseLoader(), autoescape=select_autoescape(["html"]))
    template = env.from_string(TEMPLATE)
    return template.render(
        branding=branding,
        context=payload.get("context") or {},
        sections=sections,
        methodology=methodology,
        generated_date=generated_date,
        versions={"python": platform.python_version(), "scipy": scipy.__version__},
    )


def _safe_color(value: str | None) -> str:
    """N'accepte qu'une couleur hexadécimale (le template l'injecte dans le CSS)."""
    if value and re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return value
    return "#416cae"


class PdfEngineUnavailable(RuntimeError):
    """Le moteur de rendu PDF (WeasyPrint) est indisponible sur cet environnement."""


def render_pdf(payload: dict) -> bytes:
    """Rend le rapport en PDF. Émet un événement d'audit minimal sur stdout."""
    html = build_report_html(payload)

    try:
        from weasyprint import HTML  # import différé : dépendance native lourde

        pdf = HTML(string=html).write_pdf()
    except OSError as e:
        # Bibliothèques natives (Pango/Cairo) absentes de l'environnement serverless.
        print(
            json.dumps(
                {
                    "event": "pdf_export_failed",
                    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "reason": str(e),
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        raise PdfEngineUnavailable(
            "Le moteur de génération PDF est indisponible sur cet environnement "
            "(dépendance native manquante)."
        ) from e

    print(
        json.dumps(
            {
                "event": "pdf_export",
                "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "sections": len(payload.get("sections") or []),
                "file_name": (payload.get("context") or {}).get("file_name"),
                "exported_by": (payload.get("context") or {}).get("exported_by"),
                "organization": (payload.get("context") or {}).get("organization"),
                "bytes": len(pdf),
            },
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )
    return pdf
