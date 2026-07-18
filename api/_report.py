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
import os
import pathlib
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

#: Devises proposées à l'export. Le franc CFA (XOF) est le défaut : c'est la
#: monnaie de l'UEMOA (Niger, Sénégal, Côte d'Ivoire…). Le formatage suit la
#: convention ouest-africaine, identique au français (espace comme séparateur
#: de milliers, virgule décimale) ; le FCFA s'écrit par usage sans décimales.
CURRENCIES: dict[str, dict[str, object]] = {
    "XOF": {"label": "FCFA", "name": "franc CFA (XOF)", "decimals": 0},
    "EUR": {"label": "€", "name": "euro (EUR)", "decimals": 2},
    "USD": {"label": "$", "name": "dollar US (USD)", "decimals": 2},
}

#: Espace insécable fine — sépare les milliers sans risque de coupure de ligne.
_NBSP = " "


def format_currency(value: float | int, code: str = "XOF") -> str:
    """Formate un montant selon la convention ouest-africaine : « 1 234 567 FCFA ».

    Séparateur de milliers = espace insécable, virgule décimale, suffixe de
    devise. Un code inconnu retombe sur un formatage sans suffixe.
    """
    spec = CURRENCIES.get(code)
    decimals = int(spec["decimals"]) if spec else 0
    # Formatage à l'anglaise puis substitution vers la convention FR pour éviter
    # toute dépendance à la locale système (indisponible en serverless).
    formatted = f"{value:,.{decimals}f}"  # 1,234,567.89
    formatted = (
        formatted.replace(",", "\x00").replace(".", ",").replace("\x00", _NBSP)
    )
    if spec:
        return f"{formatted}{_NBSP}{spec['label']}"
    return formatted

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
    @bottom-left { content: "{{ footer_text }}"; font-size: 7.5pt; color: #64748b; }
    @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 7.5pt; color: #64748b; }
  }
  @page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }

  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", "Helvetica Neue", Arial, sans-serif; color: #1e293b; font-size: 9.5pt; line-height: 1.55; }

  /* ---- Page de garde ---- */
  .cover { page: cover; height: 297mm; background: #0f1c2e; color: #fff; padding: 30mm 24mm; position: relative; }
  .cover .band { position: absolute; top: 0; left: 0; width: 8mm; height: 297mm; background: {{ branding.accent_color }}; }
  .cover .brand { font-size: 11pt; letter-spacing: 0.15em; text-transform: uppercase; color: #94b0d8; }
  /* Logo de l'établissement : pastille blanche pour rester lisible quel que
     soit le logo (souvent sombre sur fond transparent). */
  .cover .logo { display: inline-block; background: #fff; border-radius: 2mm; padding: 3mm 4mm; margin-bottom: 8mm; }
  .cover .logo img { max-height: 14mm; max-width: 55mm; display: block; }
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

  /* ---- Bloc de signature / visa ---- */
  .signature { margin-top: 14mm; page-break-inside: avoid; }
  .signature .place-date { font-size: 9.5pt; margin-bottom: 12mm; }
  .signature .visa { width: 70mm; margin-left: auto; text-align: center; }
  .signature .visa .line { border-top: 0.5pt solid #94a3b8; padding-top: 1.5mm; font-size: 8.5pt; color: #64748b; }
</style>
</head>
<body>

<div class="cover">
  <div class="band"></div>
  {% if branding.logo_data_uri %}<div class="logo"><img src="{{ branding.logo_data_uri }}" alt="Logo de l'établissement"></div>{% endif %}
  <div class="brand">{{ branding.bank_name }}</div>
  <h1>{{ branding.report_title }}</h1>
  <div class="subtitle">Rapport d'analyse statistique</div>
  <div class="meta">
    {% if branding.author %}<div>Préparé par : {{ branding.author }}</div>{% endif %}
    <div>{% if context.location %}{{ context.location }}, le {% endif %}{{ generated_date }}</div>
    <div>Source : {{ context.file_name }} — {{ context.row_count }} lignes, {{ context.column_count }} colonnes</div>
    {% if currency %}<div>Devise : {{ currency.label }} — {{ currency.name }}</div>{% endif %}
    <div class="confidential">Document confidentiel — secret bancaire (UEMOA / BCEAO)</div>
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
      {% if currency %}<tr><td>Devise</td><td class="num">{{ currency.label }} — {{ currency.name }}</td></tr>{% endif %}
      <tr><td>Moteur statistique</td><td class="num">Python {{ versions.python }} — scipy {{ versions.scipy }}</td></tr>
      <tr><td>Généré le</td><td class="num">{% if context.location %}{{ context.location }}, {% endif %}{{ generated_date }}</td></tr>
      {% if context.exported_by %}<tr><td>Exporté par</td><td class="num">{{ context.exported_by }}{% if context.organization %} ({{ context.organization }}){% endif %}</td></tr>{% endif %}
    </tbody>
  </table>
  <p class="muted">Reproductibilité : les résultats dépendent uniquement du fichier source et des
  options d'import listées ci-dessus. Aucune donnée individuelle n'est conservée avec ce rapport.</p>
  <p class="muted">Confidentialité : ce document et les analyses qu'il contient sont couverts par le
  secret bancaire au sens de la réglementation de l'UEMOA (BCEAO). Sa diffusion est limitée aux
  personnes habilitées de l'établissement.</p>

  <div class="signature">
    <div class="place-date">Fait à {{ context.location or "…………………" }}, le {{ generated_date }}.</div>
    <div class="visa">
      <div class="line">Signature et visa{% if branding.author %} — {{ branding.author }}{% endif %}</div>
    </div>
  </div>
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
    # Devise : défaut FCFA (contexte UEMOA). « none » = choix explicite d'aucune
    # devise ; un code absent retombe sur XOF (rétrocompatibilité).
    currency_code = branding.get("currency")
    if currency_code is None:
        currency_code = "XOF"
    currency = None if currency_code == "none" else CURRENCIES.get(currency_code)
    logo_data_uri = branding.get("logo_data_uri") or ""
    if logo_data_uri:
        _validate_image(logo_data_uri)
    branding = {
        "bank_name": branding.get("bank_name") or "Établissement",
        "report_title": branding.get("report_title") or "Analyse statistique",
        "author": branding.get("author") or "",
        "accent_color": _safe_color(branding.get("accent_color")),
        "logo_data_uri": logo_data_uri,
    }

    from markupsafe import Markup

    env = Environment(loader=BaseLoader(), autoescape=select_autoescape(["html"]))
    env.filters["currency"] = format_currency
    template = env.from_string(TEMPLATE)
    return template.render(
        branding=branding,
        footer_text=Markup(
            _css_string(f"{branding['bank_name']} — {branding['report_title']}")
        ),
        currency=currency,
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


def _css_string(value: str) -> str:
    """Assainit un texte destiné à une chaîne CSS entre guillemets (pied de page
    @page). L'autoescape HTML de Jinja est inadapté dans un bloc <style> — il
    transformerait « l'analyse » en « l&#39;analyse » — donc ce texte est rendu
    avec |safe après retrait des caractères qui permettraient de sortir de la
    chaîne ou du bloc de style."""
    return re.sub(r'["\\<>\r\n]', "", value)


class PdfEngineUnavailable(RuntimeError):
    """Le moteur de rendu PDF (WeasyPrint) est indisponible sur cet environnement."""


#: Pango/Cairo et leurs dépendances ne sont pas fournies par le runtime Python
#: serverless de Vercel (voir README, section « Déploiement Vercel »). Une
#: copie minimale (Pango, HarfBuzz, Fontconfig, Freetype... + police DejaVu)
#: est vendue ici en secours, activée systématiquement quand elle est présente
#: (voir render_pdf : mélanger ces bibliothèques avec une éventuelle version
#: système déjà chargée provoquerait un conflit d'ABI).
_VENDOR_DIR = pathlib.Path(__file__).parent / "_vendor" / "weasyprint"


#: Bibliothèques que WeasyPrint (cffi) charge lui-même par leur nom nu — sans
#: passer par un chemin. LD_LIBRARY_PATH ne peut pas les aiguiller vers notre
#: copie vendue : le lieur dynamique le lit une seule fois au démarrage du
#: processus, bien avant que ce module ne s'exécute, donc le modifier à chaud
#: via os.environ n'a aucun effet sur les dlopen() suivants. On précharge donc
#: nous-mêmes chaque bibliothèque par son chemin absolu (ctypes) ; le
#: dlopen() par nom fait ensuite par WeasyPrint les retrouve par
#: correspondance de SONAME sans avoir besoin de les chercher sur le disque.
#: Les .so vendus ont chacun un RUNPATH=$ORIGIN (patchelf, lors de la
#: préparation du vendor) : leurs propres dépendances transitives (glib,
#: freetype, harfbuzz — y compris la paire circulaire freetype↔harfbuzz) se
#: résolvent donc automatiquement dans ce même dossier, sans dépendre de
#: l'ordre de chargement ni des bibliothèques déjà présentes sur le système.
_VENDOR_LIB_ENTRYPOINTS = (
    "libgobject-2.0.so.0",
    "libpango-1.0.so.0",
    "libharfbuzz.so.0",
    "libharfbuzz-subset.so.0",
    "libfontconfig.so.1",
    "libpangoft2-1.0.so.0",
)


def _activate_vendored_native_libs() -> None:
    lib_dir = _VENDOR_DIR / "lib"
    if not lib_dir.is_dir():
        return

    import ctypes

    for name in _VENDOR_LIB_ENTRYPOINTS:
        path = lib_dir / name
        if path.is_file():
            ctypes.CDLL(str(path))

    fontconfig_conf = pathlib.Path("/tmp/statys-fonts.conf")
    fontconfig_conf.write_text(
        '<?xml version="1.0"?>\n'
        '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n'
        "<fontconfig>\n"
        f'  <dir>{_VENDOR_DIR / "fonts" / "dejavu-sans-fonts"}</dir>\n'
        '  <cachedir>/tmp/statys-fontconfig-cache</cachedir>\n'
        "</fontconfig>\n"
    )
    os.environ["FONTCONFIG_FILE"] = str(fontconfig_conf)


def render_pdf(payload: dict) -> bytes:
    """Rend le rapport en PDF. Émet un événement d'audit minimal sur stdout."""
    html = build_report_html(payload)

    try:
        # Doit s'exécuter avant le tout premier import de weasyprint : une
        # fois qu'une bibliothèque native (p. ex. le Glib système) est chargée
        # dans le processus, charger ensuite une version vendue en parallèle
        # provoquerait un conflit d'ABI entre les deux copies.
        _activate_vendored_native_libs()

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
