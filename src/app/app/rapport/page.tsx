"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/store";
import { figureToPng, REPORT_KIND_LABELS, ReportEntry } from "@/lib/report";
import { ApiError, fetchReportPdf, ReportPayload } from "@/lib/api";
import { COLUMN_TYPE_LABELS } from "@/lib/dataset";
import { canExportPdf } from "@/lib/roles";
import { useIdentity } from "@/components/RoleProvider";

const numberFr = new Intl.NumberFormat("fr-FR");

/** Au-delà, on regénère les images en qualité réduite (limite de corps Vercel). */
const MAX_PAYLOAD_BYTES = 3_500_000;

type Phase =
  | { step: "idle" }
  | { step: "charts"; done: number; total: number }
  | { step: "assembling" }
  | { step: "done"; url: string; size: number; fileName: string }
  | { step: "error"; message: string };

export default function RapportPage() {
  const { dataset, reportEntries, removeReportEntry, importOptions } = useSession();
  const identity = useIdentity();
  const exportAllowed = canExportPdf(identity.role);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [touched, setTouched] = useState(false);

  const [bankName, setBankName] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [accentColor, setAccentColor] = useState("#416cae");
  const [execNote, setExecNote] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "idle" });

  // Par défaut, toutes les analyses sont sélectionnées.
  const effectiveSelection = useMemo(() => {
    if (touched) return selected;
    return new Set(reportEntries.map((e) => e.id));
  }, [touched, selected, reportEntries]);

  if (!dataset) {
    return (
      <div className="card mx-auto max-w-2xl px-8 py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-navy-950">Rapport PDF</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Importez un jeu de données puis effectuez des analyses : chacune deviendra une section
          du rapport.
        </p>
        <Link href="/app/donnees" className="btn-primary mt-8">
          Importer un fichier
        </Link>
      </div>
    );
  }

  function toggle(id: string) {
    const next = new Set(effectiveSelection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setTouched(true);
  }

  async function generate() {
    const entries = reportEntries.filter((e) => effectiveSelection.has(e.id));
    if (entries.length === 0) return;

    try {
      const totalFigures = entries.reduce((a, e) => a + e.figures.length, 0);
      let payload = await buildPayload(entries, 2, (done) =>
        setPhase({ step: "charts", done, total: totalFigures })
      );
      if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
        // Rapport volumineux : images regénérées en qualité standard.
        payload = await buildPayload(entries, 1, (done) =>
          setPhase({ step: "charts", done, total: totalFigures })
        );
      }
      setPhase({ step: "assembling" });
      const blob = await fetchReportPdf(payload);
      const fileName = `rapport-statys-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setPhase({ step: "done", url, size: blob.size, fileName });
    } catch (e) {
      setPhase({
        step: "error",
        message: e instanceof ApiError ? e.message : "Erreur inattendue pendant la génération.",
      });
    }
  }

  async function buildPayload(
    entries: ReportEntry[],
    scale: number,
    onProgress: (done: number) => void
  ): Promise<ReportPayload> {
    const sections: ReportPayload["sections"] = [];
    let done = 0;
    for (const entry of entries) {
      const images: { title: string; data_uri: string }[] = [];
      for (const figure of entry.figures) {
        images.push({ title: figure.title, data_uri: await figureToPng(figure, scale) });
        onProgress(++done);
      }
      sections.push({
        kind: entry.kind,
        title: entry.title,
        subtitle: entry.subtitle,
        interpretation: entry.interpretation,
        images,
        tables: entry.tables,
      });
    }
    const d = dataset!;
    return {
      branding: {
        bank_name: bankName.trim() || identity.orgName,
        report_title: reportTitle.trim() || "Analyse statistique",
        author: author.trim(),
        accent_color: accentColor,
      },
      context: {
        file_name: d.fileName,
        row_count: d.rows.length,
        column_count: d.columns.length,
        import_options: [
          d.resolvedOptions.delimiter ? `délimiteur « ${d.resolvedOptions.delimiter} »` : null,
          d.resolvedOptions.encoding,
          `séparateur décimal « ${importOptions.decimalSeparator === "auto" ? "auto" : importOptions.decimalSeparator} »`,
          d.resolvedOptions.sheetName ? `feuille « ${d.resolvedOptions.sheetName} »` : null,
        ]
          .filter(Boolean)
          .join(", "),
        exec_note: execNote.trim(),
        exported_by: identity.userLabel,
        organization: identity.orgName,
      },
      sections,
    };
  }

  const busy = phase.step === "charts" || phase.step === "assembling";
  const typesSummary = dataset.columns
    .map((c) => COLUMN_TYPE_LABELS[c.type])
    .reduce<Record<string, number>>((acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }), {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-navy-950">Rapport PDF</h1>
        <p className="mt-1 text-sm text-slate-500">
          Chaque analyse effectuée dans les onglets 2 et 3 est journalisée ici. Sélectionnez les
          sections, personnalisez le branding, puis générez un PDF prêt à diffuser.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Sections */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-navy-950">
              Sections du rapport ({effectiveSelection.size} / {reportEntries.length}{" "}
              sélectionnées)
            </h2>
            <p className="text-xs text-slate-500">
              Jeu de données : {dataset.fileName} — {numberFr.format(dataset.rows.length)} lignes,{" "}
              {Object.entries(typesSummary)
                .map(([t, n]) => `${n} ${t.toLowerCase()}${n > 1 ? "s" : ""}`)
                .join(", ")}
            </p>
          </div>
          {reportEntries.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              Aucune analyse effectuée pour l&apos;instant.{" "}
              <Link href="/app/univariee" className="font-medium text-navy-700 underline">
                Lancez une analyse univariée
              </Link>{" "}
              ou{" "}
              <Link href="/app/bivariee" className="font-medium text-navy-700 underline">
                bivariée
              </Link>
              , elle apparaîtra ici automatiquement.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reportEntries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    id={`sec-${entry.id}`}
                    checked={effectiveSelection.has(entry.id)}
                    onChange={() => toggle(entry.id)}
                    className="mt-1 accent-navy-700"
                  />
                  <label htmlFor={`sec-${entry.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-navy-950">{entry.title}</span>
                      <span className="badge bg-navy-50 text-navy-700">
                        {REPORT_KIND_LABELS[entry.kind]}
                      </span>
                    </div>
                    {entry.subtitle && (
                      <div className="truncate text-xs text-slate-500">{entry.subtitle}</div>
                    )}
                  </label>
                  <button
                    onClick={() => removeReportEntry(entry.id)}
                    className="text-xs text-slate-500 hover:text-red-600"
                    aria-label={`Retirer ${entry.title}`}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Branding + génération */}
        <div className="space-y-6">
          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-navy-950">Personnalisation</h2>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Établissement (page de garde)
              </span>
              <input
                className="input"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder={identity.orgName || "Banque de Démonstration"}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Titre du rapport</span>
              <input
                className="input"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="Analyse du portefeuille crédit — T3 2026"
              />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Auteur</span>
                <input
                  className="input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Direction des risques"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Accent</span>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-slate-300"
                  aria-label="Couleur d'accent du rapport"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Note du résumé exécutif (optionnel)
              </span>
              <textarea
                className="input min-h-[70px]"
                value={execNote}
                onChange={(e) => setExecNote(e.target.value)}
                placeholder="Contexte, périmètre, avertissements…"
              />
            </label>
          </div>

          <div className="card p-5">
            {!exportAllowed && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Votre rôle « Lecteur seul » ne permet pas d&apos;exporter de rapport. Demandez à
                un administrateur de votre banque de vous passer « Analyste ».
              </p>
            )}
            <button
              onClick={generate}
              disabled={busy || effectiveSelection.size === 0 || !exportAllowed}
              className="btn-primary w-full"
            >
              {phase.step === "charts"
                ? `Génération des graphiques (${phase.done}/${phase.total})…`
                : phase.step === "assembling"
                  ? "Assemblage du PDF…"
                  : `Générer le rapport PDF (${effectiveSelection.size} section${effectiveSelection.size > 1 ? "s" : ""})`}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              La génération est asynchrone : vous pouvez continuer à naviguer, le téléchargement
              démarrera tout seul. Structure : page de garde, sommaire, résumé exécutif, une
              section par analyse, méthodologie, annexes.
            </p>
            {phase.step === "done" && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Rapport généré ({numberFr.format(Math.round(phase.size / 1024))} Ko).{" "}
                <a href={phase.url} download={phase.fileName} className="font-medium underline">
                  Télécharger à nouveau
                </a>
              </p>
            )}
            {phase.step === "error" && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {phase.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
