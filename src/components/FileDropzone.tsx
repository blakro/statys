"use client";

import { DragEvent, useRef, useState } from "react";
import { useSession } from "@/lib/store";

/** Zone de dépôt / sélection de fichier (CSV, Excel). */
export function FileDropzone() {
  const importFile = useSession((s) => s.importFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void importFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Importer un fichier de données"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-16 text-center transition ${
        dragOver ? "border-navy-500 bg-navy-50" : "border-slate-300 hover:border-navy-400"
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-100 text-navy-700">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <p className="font-medium text-navy-950">
          Déposez votre fichier ici ou cliquez pour parcourir
        </p>
        <p className="mt-1 text-sm text-slate-500">
          CSV (séparateur « ; » ou « , »), Excel (.xlsx, .xls) — encodage UTF-8 ou Latin-1
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,.xls,.xlsm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
