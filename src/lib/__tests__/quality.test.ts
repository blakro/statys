import { describe, expect, it } from "vitest";
import { Dataset } from "../dataset";
import { computeQuality } from "../quality";

function makeDataset(rows: Dataset["rows"], columnNames: string[]): Dataset {
  return {
    fileName: "test.csv",
    sourceFormat: "csv",
    columns: columnNames.map((name) => ({
      name,
      detectedType: "text",
      type: "text",
    })),
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

describe("computeQuality", () => {
  it("compte les valeurs manquantes par colonne", () => {
    const ds = makeDataset(
      [
        ["a", ""],
        ["b", "NA"],
        ["c", "x"],
      ],
      ["c1", "c2"]
    );
    const report = computeQuality(ds);
    expect(report.columns[0].missing).toBe(0);
    expect(report.columns[1].missing).toBe(2);
    expect(report.totalMissing).toBe(2);
  });

  it("détecte les lignes dupliquées", () => {
    const ds = makeDataset(
      [
        ["a", "1"],
        ["a", "1"],
        ["a", "2"],
        ["a", "1"],
      ],
      ["c1", "c2"]
    );
    expect(computeQuality(ds).duplicateRows).toBe(2);
  });

  it("ne confond pas des lignes dont la concaténation est identique", () => {
    const ds = makeDataset(
      [
        ["ab", "c"],
        ["a", "bc"],
      ],
      ["c1", "c2"]
    );
    expect(computeQuality(ds).duplicateRows).toBe(0);
  });

  it("calcule la cardinalité par colonne", () => {
    const ds = makeDataset(
      [
        ["x", "1"],
        ["y", "1"],
        ["x", "2"],
      ],
      ["c1", "c2"]
    );
    const report = computeQuality(ds);
    expect(report.columns[0].distinct).toBe(2);
    expect(report.columns[1].distinct).toBe(2);
  });
});
