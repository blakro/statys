import { describe, expect, it } from "vitest";
import { convertCell, detectColumnType, parseDate, parseNumber } from "../detect";

describe("parseNumber (formats français et anglo-saxons)", () => {
  it("lit la virgule décimale française", () => {
    expect(parseNumber("1234,56", "auto")).toBe(1234.56);
    expect(parseNumber("-0,5", "auto")).toBe(-0.5);
  });

  it("lit les milliers en espace (y compris insécable)", () => {
    expect(parseNumber("1 234,56", "auto")).toBe(1234.56);
    expect(parseNumber("12 345", "auto")).toBe(12345);
    expect(parseNumber("1 234 567,89", "auto")).toBe(1234567.89);
  });

  it("lit le format anglo-saxon quand les deux séparateurs sont présents", () => {
    expect(parseNumber("1,234.56", "auto")).toBe(1234.56);
    expect(parseNumber("1.234,56", "auto")).toBe(1234.56);
  });

  it("respecte un séparateur décimal forcé", () => {
    expect(parseNumber("1.234", ",")).toBe(1234); // point = milliers
    expect(parseNumber("1.234", ".")).toBe(1.234);
  });

  it("lit la notation scientifique", () => {
    expect(parseNumber("1,5e3", "auto")).toBe(1500);
    expect(parseNumber("2E-2", "auto")).toBe(0.02);
  });

  it("rejette les chaînes non numériques", () => {
    expect(parseNumber("abc", "auto")).toBeNull();
    expect(parseNumber("12abc", "auto")).toBeNull();
    expect(parseNumber("1,23,4", "auto")).toBeNull();
  });
});

describe("parseDate", () => {
  it("lit les dates ISO et françaises", () => {
    expect(parseDate("2024-03-15")?.getFullYear()).toBe(2024);
    const fr = parseDate("15/03/2024");
    expect(fr?.getDate()).toBe(15);
    expect(fr?.getMonth()).toBe(2);
  });

  it("rejette les dates impossibles", () => {
    expect(parseDate("31/02/2024")).toBeNull();
    expect(parseDate("15/13/2024")).toBeNull();
    expect(parseDate("banane")).toBeNull();
  });
});

describe("detectColumnType", () => {
  it("détecte une colonne numérique au format français", () => {
    expect(detectColumnType(["1 234,5", "0,7", "-12", "8", ""], "auto")).toBe("numeric");
  });

  it("détecte une colonne de dates", () => {
    expect(detectColumnType(["01/01/2023", "15/06/2023", "31/12/2023"], "auto")).toBe("date");
  });

  it("détecte une colonne catégorielle", () => {
    const values = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? "Oui" : "Non"));
    expect(detectColumnType(values, "auto")).toBe("categorical");
  });

  it("un code 0/1 est détecté numérique (convertible manuellement)", () => {
    expect(detectColumnType(["0", "1", "1", "0"], "auto")).toBe("numeric");
  });

  it("les valeurs manquantes n'influencent pas la détection", () => {
    expect(detectColumnType(["NA", "", "3,14", "2,72", null], "auto")).toBe("numeric");
  });
});

describe("convertCell", () => {
  it("convertit selon le type effectif de la colonne", () => {
    expect(convertCell("1,5", "numeric", "auto")).toBe(1.5);
    expect(convertCell("1", "categorical", "auto")).toBe("1");
    expect(convertCell("15/03/2024", "date", "auto")).toBeInstanceOf(Date);
  });

  it("retourne null pour les valeurs manquantes ou invalides", () => {
    expect(convertCell("", "numeric", "auto")).toBeNull();
    expect(convertCell("N/A", "numeric", "auto")).toBeNull();
    expect(convertCell("abc", "numeric", "auto")).toBeNull();
  });
});
