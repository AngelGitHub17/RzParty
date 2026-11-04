import { describe, expect, it } from "vitest";
import { compareVersions, parseChangelog, readChangelog, version } from "../src/updater.ts";

describe("mises à jour", () => {
  it("compare les numéros de version", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.10.0", "0.9.3")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
    expect(compareVersions("0.2.0", "0.2.1")).toBeLessThan(0);
  });

  it("lit le journal au format « ## version — date »", () => {
    const entries = parseChangelog("# Titre\n\nintro\n\n## 0.3.0 — 5 mai 2027\n- **Gros** ajout\n- Petit ajout\n\n## v0.2.0\n* Avant\n");
    expect(entries).toEqual([
      { version: "0.3.0", date: "5 mai 2027", items: ["Gros ajout", "Petit ajout"] },
      { version: "0.2.0", date: "", items: ["Avant"] },
    ]);
  });

  it("le CHANGELOG du projet décrit la version de package.json", () => {
    const entries = readChangelog();
    expect(entries[0]?.version).toBe(version);
    expect(entries[0]?.items.length).toBeGreaterThan(0);
  });
});
