# Statys — Plateforme SaaS d'analyse statistique pour banques

Plateforme multi-tenant permettant à un analyste d'importer un jeu de données
(CSV, Excel), d'explorer chaque variable (analyses univariées et bivariées avec
sélection automatique des tests statistiques) et d'exporter un rapport PDF.

**Principe de confidentialité** : le fichier importé reste en mémoire dans le
navigateur le temps de la session. Chaque calcul envoie à l'API Python la
tranche de données strictement nécessaire ; rien n'est écrit sur disque ni
stocké côté serveur.

## Architecture

Un seul projet Vercel, un seul repo :

- **Frontend** : Next.js 14 (App Router, TypeScript, Tailwind CSS) — dossier `src/`.
- **Moteur statistique** : fonctions serverless Python (FastAPI) — dossier `api/`.
  En dev, uvicorn sert l'API sur le port 8000 et Next.js proxifie `/api/py/*`
  vers elle (voir `next.config.mjs`) ; en production Vercel exécute
  `api/index.py` comme fonction serverless.
- **Aucune base de données** : les comptes, organisations et rôles sont gérés
  par Clerk ; les données analysées ne sont jamais stockées.

## Multi-tenant (Clerk)

Une **organisation Clerk = une banque**. La plateforme fonctionne dans deux
modes, détectés automatiquement :

- **Clerk configuré** (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` +
  `CLERK_SECRET_KEY`) : connexion via `/sign-in`, sélecteur d'organisation
  dans le header (gestion des membres et **invitations** intégrée), rôles.
- **Mode démo** (clés absentes) : compte unique `DEMO_EMAIL`/`DEMO_PASSWORD`
  de la Phase 1, badge « Mode démo » affiché — pratique en local et en CI.

Mise en place côté dashboard Clerk :

1. créer l'application, activer **Organizations** ;
2. (optionnel) créer le rôle personnalisé **`org:lecteur`** — clé exacte —
   pour le profil « lecteur seul » ;
3. renseigner les variables d'environnement (voir `.env.example`).

Correspondance des rôles :

| Rôle Clerk    | Rôle Statys          | Capacités |
|---------------|----------------------|-----------|
| `org:admin`   | Administrateur banque | tout + gestion des membres/invitations (via le sélecteur d'organisation) |
| `org:member`  | Analyste             | import, analyses, export PDF |
| `org:lecteur` | Lecteur seul         | import et analyses, **pas d'export PDF** |

Journal d'audit : les connexions sont tracées nativement par Clerk
(dashboard → Users/Sessions) ; chaque export PDF émet un événement
`pdf_export` (horodatage, utilisateur, organisation, fichier, volumétrie —
jamais les données) visible dans les logs Vercel de la fonction Python, et
l'identité de l'exportateur figure en annexe du PDF.

## Lancement en local

Prérequis : Node.js ≥ 18, Python ≥ 3.9.

```bash
# 1. Dépendances frontend
npm install

# 2. Dépendances Python (idéalement dans un venv)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3. Variables d'environnement
cp .env.example .env.local
# → renseignez AUTH_SECRET (openssl rand -hex 32), DEMO_EMAIL, DEMO_PASSWORD

# 4. Démarrage (Next.js + API Python ensemble)
npm run dev
```

L'application est disponible sur http://localhost:3000 (connexion avec
`DEMO_EMAIL` / `DEMO_PASSWORD`), l'API Python sur
http://localhost:8000/api/py/docs.

## Tests

```bash
npm test        # tests unitaires front (détection de types, parsing FR, qualité)
npm run lint    # ESLint

# tests du moteur statistique Python (cas connus, sélection des tests)
pip install -r requirements-dev.txt
cd api && python -m pytest test_stats.py -q
```

## Déploiement Vercel

Créer un projet Vercel pointant sur ce repo (racine du projet = racine du
repo). Vercel détecte Next.js et construit automatiquement `api/index.py` en fonction
serverless Python (`requirements.txt` à la racine). Définir les
variables d'environnement `AUTH_SECRET`, `DEMO_EMAIL`, `DEMO_PASSWORD` dans le
dashboard Vercel.

Points de vigilance :

- timeout des fonctions Python : `vercel.json` fixe `maxDuration: 60` pour la
  génération PDF ;
- bundle Python limité à 500 Mo non compressés : ne pas ajouter scikit-learn
  ou Playwright ;
- WeasyPrint s'appuie sur les bibliothèques natives Pango/HarfBuzz/Fontconfig,
  absentes du runtime Python serverless de Vercel. Une copie minimale (~15 Mo,
  build Amazon Linux 2023 / Python 3.12 assortie d'une police DejaVu) est
  vendue dans `api/_vendor/weasyprint/` et chargée automatiquement par
  `_report.py` quand elle est présente — voir les commentaires de
  `_activate_vendored_native_libs()` pour le détail du mécanisme (préchargement
  par chemin absolu + RUNPATH `$ORIGIN`, LD_LIBRARY_PATH étant inefficace une
  fois le processus démarré). Si l'export échoue quand même, l'API répond une
  503 explicite plutôt qu'un crash ASGI brut.

## Spécificités des fichiers français

L'import gère automatiquement (avec correction manuelle possible) :

- délimiteur CSV `;` (détection parmi `;`, `,`, tabulation, `|`) ;
- encodage UTF-8 / Latin-1 (Windows-1252) ;
- virgule décimale et milliers en espace (`1 234,56`) ;
- dates `jj/mm/aaaa` ;
- détection du type de chaque colonne (numérique / catégorielle / date / texte)
  avec conversion manuelle — ex. un code 0/1 détecté « numérique » peut être
  forcé en « catégorielle ».

## Plan de construction

1. ✅ **Phase 1** — Socle Next.js + FastAPI, auth basique, onglet Données
   (import, aperçu paginé, conversion de types, qualité des données).
2. ✅ **Phase 2** — Analyse univariée : histogramme (classes ajustables),
   boxplot, QQ-plot, nuage valeur/index (jitter), test de normalité à
   sélection automatique (Shapiro-Wilk si n < 5000, sinon D'Agostino-Pearson),
   tableau complet (tendance centrale / dispersion / position), et pour les
   qualitatives : camembert (< 4 modalités) ou barres triées (≥ 4), tableau de
   fréquences avec cumulées et manquantes en catégorie à part.
3. ✅ **Phase 3** — Analyse bivariée. Quantitatif × quantitatif : nuage +
   régression (R²), Pearson / Spearman / Kendall avec p-value et IC 95 %,
   matrice de corrélation (heatmap). Qualitatif × quantitatif : arbre de
   décision implémenté en logique — normalité par groupe (Shapiro-Wilk),
   Levene (+ Bartlett en complément si normalité), puis Student / Welch /
   Mann-Whitney / ANOVA / ANOVA de Welch / Kruskal-Wallis, taille d'effet
   systématique (d de Cohen, η², ε², corrélation bisériale de rang), KS à
   deux échantillons en option. Qualitatif × qualitatif : contingence
   (observés / attendus / résidus standardisés ajustés), Khi-deux avec
   bascule automatique sur Fisher exact (2×2, attendu < 5), V de Cramér,
   barres empilées/groupées.
4. ✅ **Phase 4** — Rapport PDF premium (WeasyPrint, rendu HTML/CSS → PDF) :
   page de garde brandée (établissement, titre, auteur, couleur d'accent),
   sommaire avec numéros de page, résumé exécutif, une section par analyse
   effectuée (graphiques identiques à l'écran — capturés en PNG par Plotly
   côté navigateur, donc aucun moteur de rendu graphique dans la fonction
   serverless —, tableaux, interprétation automatique), méthodologie adaptée
   aux tests réellement utilisés, annexes de reproductibilité. Génération
   asynchrone avec progression ; les analyses des onglets 2 et 3 sont
   journalisées automatiquement et sélectionnables dans l'onglet 4.
5. ✅ **Phase 5** — Couche SaaS multi-tenant via Clerk : organisations =
   banques, rôles admin/analyste/lecteur, invitations via le sélecteur
   d'organisation, localisation française, thème aligné ; repli « mode
   démo » automatique sans clés ; le middleware protège aussi l'API
   statistique (/api/py → 401 sans session) ; audit des exports enrichi
   (utilisateur + organisation).
6. ✅ **Phase 6** — Polish UI/UX : icône de marque, pages d'erreur et 404
   françaises, lien d'évitement clavier, focus visible homogène, respect de
   `prefers-reduced-motion`, contrastes relevés (WCAG AA), squelettes de
   chargement annoncés aux lecteurs d'écran, indicateurs de navigation
   (données chargées, compteur de sections du rapport), bandeau « étape
   suivante » après import, spinner de lecture, chargement paresseux de la
   librairie Excel (bundle initial allégé).
