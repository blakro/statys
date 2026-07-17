import { describe, expect, it } from "vitest";
import { canExportPdf, mapClerkRole } from "../roles";

describe("mapClerkRole", () => {
  it("mappe les rôles Clerk vers les rôles Statys", () => {
    expect(mapClerkRole("org:admin")).toBe("admin");
    expect(mapClerkRole("org:member")).toBe("analyste");
    expect(mapClerkRole("org:lecteur")).toBe("lecteur");
    expect(mapClerkRole("org:reader")).toBe("lecteur");
  });

  it("retombe sur analyste pour un rôle inconnu ou absent", () => {
    expect(mapClerkRole("org:custom")).toBe("analyste");
    expect(mapClerkRole(null)).toBe("analyste");
    expect(mapClerkRole(undefined)).toBe("analyste");
  });
});

describe("canExportPdf", () => {
  it("seul le lecteur est privé d'export", () => {
    expect(canExportPdf("admin")).toBe(true);
    expect(canExportPdf("analyste")).toBe(true);
    expect(canExportPdf("lecteur")).toBe(false);
  });
});
