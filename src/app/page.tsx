import Link from "next/link";

/**
 * Page d'accueil publique : la première chose qu'un prospect voit avant de se
 * connecter. Sobre, institutionnelle, centrée sur l'argument différenciant —
 * la confidentialité (les données restent dans le navigateur) — et le contexte
 * UEMOA (FCFA, secret bancaire). Aucun chiffre inventé, aucune fausse référence.
 */

const LogoMark = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#0f1c2e" />
    <rect x="12" y="38" width="8" height="14" rx="2" fill="#638ac4" />
    <rect x="24" y="28" width="8" height="24" rx="2" fill="#94b0d8" />
    <rect x="36" y="18" width="8" height="34" rx="2" fill="#bfcfe8" />
    <path
      d="M14 30 Q26 12 50 14"
      fill="none"
      stroke="#f0b429"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

const FEATURES = [
  {
    step: "1",
    title: "Import aux conventions locales",
    body: "CSV « ; », virgule décimale, dates jj/mm/aaaa, encodage Latin-1 des vieux exports de core banking : le fichier est lu correctement du premier coup, types détectés et corrigeables.",
  },
  {
    step: "2",
    title: "Analyses univariées",
    body: "Histogramme, boxplot, QQ-plot, tableau complet de statistiques descriptives et test de normalité à sélection automatique — Shapiro-Wilk ou D'Agostino-Pearson selon l'effectif.",
  },
  {
    step: "3",
    title: "Analyses bivariées",
    body: "Corrélations avec intervalles de confiance, comparaisons de groupes avec arbre de décision statistique (Student, Welch, Mann-Whitney, ANOVA, Kruskal-Wallis…), tableaux croisés avec Khi-deux ou Fisher exact.",
  },
  {
    step: "4",
    title: "Rapport PDF prêt à diffuser",
    body: "Page de garde à vos couleurs, sommaire, interprétations automatiques, méthodologie, montants en FCFA, mention du secret bancaire UEMOA/BCEAO et bloc de signature « Fait à …, le … ».",
  },
];

const CONFIDENTIALITE = [
  {
    title: "Les données restent dans le navigateur",
    body: "Le fichier importé vit en mémoire le temps de la session. Fermer l'onglet suffit : il ne reste rien.",
  },
  {
    title: "Rien n'est stocké côté serveur",
    body: "Chaque calcul reçoit la tranche de données strictement nécessaire, répond, et n'écrit rien sur disque. Aucune base de données ne conserve vos chiffres.",
  },
  {
    title: "Exports tracés",
    body: "Chaque génération de rapport émet un événement d'audit — qui, quand, quel fichier, jamais les données — et l'identité de l'exportateur figure en annexe du PDF.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* En-tête */}
      <header className="border-b border-navy-900 bg-navy-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <div className="text-sm font-semibold leading-tight">Statys</div>
              <div className="text-xs leading-tight text-navy-300">
                Analyse statistique bancaire
              </div>
            </div>
          </div>
          <Link
            href="/app/donnees"
            className="rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium text-navy-100 transition hover:bg-navy-800"
          >
            Se connecter
          </Link>
        </div>
      </header>

      {/* Héros */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full w-1.5 bg-[#f0b429]"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[3fr_2fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-navy-300">
              Pour les banques et institutions financières de la zone UEMOA
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              De l&apos;export core banking au rapport statistique,{" "}
              <span className="text-[#f0b429]">sans que les données quittent l&apos;analyste</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-navy-200">
              Importez un fichier CSV ou Excel, explorez chaque variable avec les bons tests
              statistiques — sélectionnés automatiquement — et exportez un rapport PDF en FCFA,
              conforme aux usages de la place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/app/donnees"
                className="rounded-lg bg-[#f0b429] px-5 py-3 text-sm font-semibold text-navy-950 transition hover:bg-[#f6c453]"
              >
                Accéder à la plateforme
              </Link>
              <a
                href="#confidentialite"
                className="rounded-lg border border-navy-600 px-5 py-3 text-sm font-medium text-navy-100 transition hover:bg-navy-800"
              >
                Comment vos données sont protégées
              </a>
            </div>
          </div>

          {/* Évocation de la page de garde du rapport */}
          <div aria-hidden className="hidden lg:block">
            <div className="relative mx-auto w-72 rotate-1 rounded-lg bg-navy-900 p-6 shadow-2xl ring-1 ring-navy-700">
              <div className="absolute left-0 top-0 h-full w-2 rounded-l-lg bg-[#f0b429]" />
              <div className="text-[10px] uppercase tracking-[0.18em] text-navy-300">
                Banque de Démonstration
              </div>
              <div className="mt-10 text-lg font-bold leading-snug">
                Analyse du portefeuille crédit
              </div>
              <div className="mt-1 text-xs text-navy-300">Rapport d&apos;analyse statistique</div>
              <div className="mt-12 space-y-1.5 border-t border-navy-700 pt-4 text-[10px] text-navy-200">
                <div>Niamey, le 18 juillet 2026</div>
                <div>Source : portefeuille-credit.csv — 320 lignes</div>
                <div>Devise : FCFA — franc CFA (XOF)</div>
              </div>
              <div className="mt-4 inline-block rounded border border-navy-500 px-2 py-1 text-[8px] uppercase tracking-wider text-navy-200">
                Document confidentiel — secret bancaire
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Confidentialité */}
      <section id="confidentialite" className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-navy-950">
            Conçu pour le secret bancaire
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            L&apos;architecture repose sur un principe simple : la plateforme n&apos;a pas besoin de
            conserver vos données pour les analyser.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {CONFIDENTIALITE.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold text-navy-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fonctionnalités : le parcours en 4 étapes */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-navy-950">
          Un parcours guidé, de l&apos;import au rapport
        </h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Les tests statistiques sont sélectionnés automatiquement selon les conditions vérifiées
          sur vos données — la méthodologie est documentée dans chaque rapport.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.step} className="flex gap-4 rounded-xl border border-slate-200 p-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-950 text-sm font-bold text-white">
                {f.step}
              </div>
              <div>
                <h3 className="font-semibold text-navy-950">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bandeau démo */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-navy-950">
              Voyez-la fonctionner en deux minutes
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Un jeu d&apos;exemple intégré — portefeuille crédit fictif de 320 dossiers en FCFA,
              agences de Niamey à Agadez — permet d&apos;essayer tout le parcours sans préparer de
              fichier. Données générées, aucune donnée réelle.
            </p>
          </div>
          <Link
            href="/app/donnees"
            className="rounded-lg bg-navy-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
          >
            Essayer avec le jeu d&apos;exemple
          </Link>
        </div>
      </section>

      {/* Pied de page */}
      <footer className="bg-navy-950 text-navy-300">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark size={28} />
            <span className="text-sm">Statys — analyse statistique pour banques</span>
          </div>
          <a
            href="mailto:mohblakro@gmail.com"
            className="text-sm underline-offset-2 hover:text-white hover:underline"
          >
            Nous contacter
          </a>
        </div>
      </footer>
    </div>
  );
}
