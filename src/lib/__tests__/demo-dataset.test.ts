import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_IMPORT_OPTIONS } from "../dataset";
import { parseFile } from "../parse";

/**
 * Le jeu de démonstration (portefeuille crédit fictif en FCFA) doit passer par
 * le pipeline d'import standard avec les bonnes détections : c'est lui que
 * verra un prospect en premier.
 */

function loadDemoBuffer(): ArrayBuffer {
  const buf = readFileSync(
    join(__dirname, "../../../public/demo/portefeuille-credit-demo.csv")
  );
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("jeu de démonstration FCFA", () => {
  it("se parse avec les détections attendues", async () => {
    const dataset = await parseFile(
      "portefeuille-credit-demo.csv",
      loadDemoBuffer(),
      { ...DEFAULT_IMPORT_OPTIONS }
    );

    expect(dataset.rows.length).toBe(320);
    expect(dataset.columns.length).toBe(12);
    expect(dataset.resolvedOptions.delimiter).toBe(";");
    expect(dataset.resolvedOptions.decimalSeparator).toBe(",");

    const types = Object.fromEntries(dataset.columns.map((c) => [c.name, c.type]));
    expect(types["montant_accorde_fcfa"]).toBe("numeric");
    expect(types["encours_fcfa"]).toBe("numeric");
    expect(types["impaye_fcfa"]).toBe("numeric");
    expect(types["taux_interet_pct"]).toBe("numeric");
    expect(types["duree_mois"]).toBe("numeric");
    expect(types["date_octroi"]).toBe("date");
    expect(types["agence"]).toBe("categorical");
    expect(types["secteur"]).toBe("categorical");
    expect(types["statut"]).toBe("categorical");
  });
});
