import { describe, expect, it } from "vitest";
import { Dataset } from "../dataset";
import { buildCrosstab, extractNumericPair, groupNumericByCategory } from "../bivariate-prep";

function makeDataset(columnNames: string[], rows: Dataset["rows"]): Dataset {
  return {
    fileName: "test.csv",
    sourceFormat: "csv",
    columns: columnNames.map((name) => ({ name, detectedType: "text", type: "text" })),
    rows,
    resolvedOptions: {
      delimiter: ";",
      encoding: "utf-8",
      decimalSeparator: ",",
      sheetName: null,
      sheetNames: [],
    },
  };
}

describe("extractNumericPair", () => {
  it("convertit les nombres français et aligne les manquants", () => {
    const ds = makeDataset(["a", "b"], [
      ["1,5", "2,5"],
      ["", "3"],
      ["2,0", "abc"],
    ]);
    const { x, y } = extractNumericPair(ds, "a", "b", ",");
    expect(x).toEqual([1.5, null, 2]);
    expect(y).toEqual([2.5, 3, null]);
  });
});

describe("groupNumericByCategory", () => {
  it("regroupe par modalité et exclut les lignes incomplètes", () => {
    const ds = makeDataset(["grp", "val"], [
      ["A", "1"],
      ["A", "2"],
      ["B", "3"],
      ["", "4"],
      ["B", ""],
    ]);
    const { groups, excluded } = groupNumericByCategory(ds, "grp", "val", ",");
    expect(groups).toEqual({ A: [1, 2], B: [3] });
    expect(excluded).toBe(2);
  });
});

describe("buildCrosstab", () => {
  it("compte les croisements et trie par effectifs marginaux décroissants", () => {
    const ds = makeDataset(["x", "y"], [
      ["A", "Oui"],
      ["A", "Oui"],
      ["A", "Non"],
      ["B", "Non"],
      ["", "Oui"],
    ]);
    const ct = buildCrosstab(ds, "x", "y");
    expect(ct.rowLabels).toEqual(["A", "B"]);
    // "Oui" (2) < "Non" (2) à égalité — l'ordre est stable ; vérifie les effectifs.
    expect(ct.total).toBe(4);
    expect(ct.excluded).toBe(1);
    const iOui = ct.colLabels.indexOf("Oui");
    const iNon = ct.colLabels.indexOf("Non");
    expect(ct.observed[0][iOui]).toBe(2); // A × Oui
    expect(ct.observed[0][iNon]).toBe(1); // A × Non
    expect(ct.observed[1][iNon]).toBe(1); // B × Non
    expect(ct.observed[1][iOui]).toBe(0);
  });

  it("signale un croisement à trop de modalités", () => {
    const rows = Array.from({ length: 40 }, (_, i) => [`m${i}`, "x"] as Dataset["rows"][number]);
    const ct = buildCrosstab(makeDataset(["x", "y"], rows), "x", "y");
    expect(ct.tooManyModalities).toBe(true);
  });
});
