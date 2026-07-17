"use client";

/**
 * État global de la session d'analyse (Zustand).
 * Le fichier importé et le dataset restent en mémoire navigateur uniquement.
 */

import { create } from "zustand";
import {
  ColumnType,
  Dataset,
  DEFAULT_IMPORT_OPTIONS,
  ImportOptions,
} from "./dataset";
import { parseFile, ParseError } from "./parse";
import { clearApiCache } from "./api";
import { ReportEntry } from "./report";

interface SessionState {
  dataset: Dataset | null;
  /** Buffer du fichier d'origine, conservé pour re-parser avec d'autres options. */
  fileBuffer: ArrayBuffer | null;
  importOptions: ImportOptions;
  importError: string | null;
  isParsing: boolean;

  /** Journal des analyses de la session (sections candidates du rapport PDF). */
  reportEntries: ReportEntry[];

  importFile: (file: File) => Promise<void>;
  updateOptions: (options: Partial<ImportOptions>) => Promise<void>;
  setColumnType: (columnIndex: number, type: ColumnType) => void;
  addReportEntry: (entry: ReportEntry) => void;
  removeReportEntry: (id: string) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  dataset: null,
  fileBuffer: null,
  importOptions: DEFAULT_IMPORT_OPTIONS,
  importError: null,
  isParsing: false,
  reportEntries: [],

  importFile: async (file: File) => {
    set({ isParsing: true, importError: null });
    clearApiCache();
    try {
      const buffer = await file.arrayBuffer();
      const options = { ...DEFAULT_IMPORT_OPTIONS };
      const dataset = await parseFile(file.name, buffer, options);
      set({
        dataset,
        fileBuffer: buffer,
        importOptions: options,
        isParsing: false,
        reportEntries: [],
      });
    } catch (e) {
      set({
        isParsing: false,
        dataset: null,
        fileBuffer: null,
        importError:
          e instanceof ParseError ? e.message : "Erreur inattendue lors de la lecture du fichier.",
      });
    }
  },

  updateOptions: async (partial: Partial<ImportOptions>) => {
    const { dataset, fileBuffer, importOptions } = get();
    if (!dataset || !fileBuffer) return;
    const options = { ...importOptions, ...partial };
    set({ isParsing: true, importError: null });
    clearApiCache();
    try {
      const reparsed = await parseFile(dataset.fileName, fileBuffer, options);
      set({ dataset: reparsed, importOptions: options, isParsing: false });
    } catch (e) {
      set({
        isParsing: false,
        importOptions: options,
        importError:
          e instanceof ParseError ? e.message : "Erreur inattendue lors de la relecture du fichier.",
      });
    }
  },

  setColumnType: (columnIndex: number, type: ColumnType) => {
    const { dataset } = get();
    if (!dataset) return;
    const columns = dataset.columns.map((col, i) =>
      i === columnIndex ? { ...col, type } : col
    );
    set({ dataset: { ...dataset, columns } });
  },

  addReportEntry: (entry: ReportEntry) => {
    const { reportEntries } = get();
    const index = reportEntries.findIndex((e) => e.id === entry.id);
    if (index >= 0) {
      // Re-visite d'une analyse : remplace la section, conserve sa position.
      const next = reportEntries.slice();
      next[index] = { ...entry, createdAt: reportEntries[index].createdAt };
      set({ reportEntries: next });
    } else {
      set({ reportEntries: [...reportEntries, entry] });
    }
  },

  removeReportEntry: (id: string) =>
    set({ reportEntries: get().reportEntries.filter((e) => e.id !== id) }),

  reset: () => {
    clearApiCache();
    set({
      dataset: null,
      fileBuffer: null,
      importOptions: DEFAULT_IMPORT_OPTIONS,
      importError: null,
      isParsing: false,
      reportEntries: [],
    });
  },
}));
