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

interface SessionState {
  dataset: Dataset | null;
  /** Buffer du fichier d'origine, conservé pour re-parser avec d'autres options. */
  fileBuffer: ArrayBuffer | null;
  importOptions: ImportOptions;
  importError: string | null;
  isParsing: boolean;

  importFile: (file: File) => Promise<void>;
  updateOptions: (options: Partial<ImportOptions>) => void;
  setColumnType: (columnIndex: number, type: ColumnType) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  dataset: null,
  fileBuffer: null,
  importOptions: DEFAULT_IMPORT_OPTIONS,
  importError: null,
  isParsing: false,

  importFile: async (file: File) => {
    set({ isParsing: true, importError: null });
    clearApiCache();
    try {
      const buffer = await file.arrayBuffer();
      const options = { ...DEFAULT_IMPORT_OPTIONS };
      const dataset = parseFile(file.name, buffer, options);
      set({ dataset, fileBuffer: buffer, importOptions: options, isParsing: false });
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

  updateOptions: (partial: Partial<ImportOptions>) => {
    const { dataset, fileBuffer, importOptions } = get();
    if (!dataset || !fileBuffer) return;
    const options = { ...importOptions, ...partial };
    set({ isParsing: true, importError: null });
    clearApiCache();
    try {
      const reparsed = parseFile(dataset.fileName, fileBuffer, options);
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

  reset: () => {
    clearApiCache();
    set({
      dataset: null,
      fileBuffer: null,
      importOptions: DEFAULT_IMPORT_OPTIONS,
      importError: null,
      isParsing: false,
    });
  },
}));
