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
- **Aucune base de données** : les comptes seront gérés par Clerk (Phase 5),
  les données analysées ne sont jamais stockées.

## Lancement en local

Prérequis : Node.js ≥ 18, Python ≥ 3.9.

```bash
cd web

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

Créer un projet Vercel pointant sur ce repo avec **Root Directory = `web`**.
Vercel détecte Next.js et construit automatiquement `api/index.py` en fonction
serverless Python (`requirements.txt` à la racine de `web/`). Définir les
variables d'environnement `AUTH_SECRET`, `DEMO_EMAIL`, `DEMO_PASSWORD` dans le
dashboard Vercel.

Points de vigilance :

- timeout des fonctions Python : `vercel.json` fixe `maxDuration: 60` pour la
  génération PDF ;
- bundle Python limité à 500 Mo non compressés : ne pas ajouter scikit-learn
  ou Playwright ;
- WeasyPrint s'appuie sur les bibliothèques natives Pango/Cairo. Elles sont
  présentes sur les distributions Linux classiques (dont ce dev container) ;
  si l'environnement serverless ne les fournit pas, la fonction de calcul
  peut être extraite telle quelle dans un conteneur Docker (chemin déjà prévu
  pour l'hébergement dédié — voir « Sécurité »).

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
5. ⬜ **Phase 5** — Couche SaaS multi-tenant via Clerk (organisations, rôles).
6. ⬜ **Phase 6** — Polish UI/UX (branding, responsive, accessibilité).
