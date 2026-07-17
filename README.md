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
npm test        # tests unitaires (détection de types, parsing FR, qualité)
npm run lint    # ESLint
```

## Déploiement Vercel

Créer un projet Vercel pointant sur ce repo avec **Root Directory = `web`**.
Vercel détecte Next.js et construit automatiquement `api/index.py` en fonction
serverless Python (`requirements.txt` à la racine de `web/`). Définir les
variables d'environnement `AUTH_SECRET`, `DEMO_EMAIL`, `DEMO_PASSWORD` dans le
dashboard Vercel.

Points de vigilance :

- timeout des fonctions Python : 10 s (Hobby) / 60 s (Pro) — à surveiller pour
  la génération PDF (Phase 4), augmenter `maxDuration` si besoin ;
- bundle Python limité à 500 Mo non compressés : ne pas ajouter scikit-learn
  ou Playwright.

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
2. ⬜ **Phase 2** — Analyse univariée (graphiques, tests de normalité, tableaux).
3. ⬜ **Phase 3** — Analyse bivariée (arbre de décision statistique implémenté).
4. ⬜ **Phase 4** — Rapport PDF premium (WeasyPrint).
5. ⬜ **Phase 5** — Couche SaaS multi-tenant via Clerk (organisations, rôles).
6. ⬜ **Phase 6** — Polish UI/UX (branding, responsive, accessibilité).
