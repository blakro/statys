"use client";

import { COLUMN_TYPE_LABELS, ColumnType, Dataset } from "@/lib/dataset";

/** Sélecteur de variable, groupé par type effectif. */
export function VariablePicker({
  dataset,
  selected,
  onSelect,
}: {
  dataset: Dataset;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const groups: ColumnType[] = ["numeric", "categorical", "date", "text"];
  return (
    <label className="block max-w-md">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Variable à analyser</span>
      <select
        className="select w-full py-2.5"
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          Choisir une variable…
        </option>
        {groups.map((type) => {
          const cols = dataset.columns.filter((c) => c.type === type);
          if (cols.length === 0) return null;
          return (
            <optgroup key={type} label={COLUMN_TYPE_LABELS[type]}>
              {cols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
