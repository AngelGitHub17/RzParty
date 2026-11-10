import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, downloadRelease, freezeLauncher, isGitInstall, listReleases, parseChangelog, readChangelog, version } from "../src/updater.ts";

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

  it("une version archivée ne se met plus à jour toute seule", () => {
    expect(freezeLauncher("start.bat", "@echo off\nchcp 65001 >nul\n")).toBe("@echo off\nset RZ_UPDATE_URL=off\nchcp 65001 >nul\n");
    expect(freezeLauncher("start.sh", "#!/usr/bin/env sh\nexec npm start\n")).toBe("#!/usr/bin/env sh\nexport RZ_UPDATE_URL=off\nexec npm start\n");
  });

  it.runIf(isGitInstall)("liste les versions publiées et fabrique l'archive figée d'une ancienne version", async () => {
    const releases = await listReleases();
    expect(releases[0]).toMatchObject({ version, latest: true });
    expect(releases.filter((r) => r.latest)).toHaveLength(1);
    const old = releases.find((r) => r.version === "0.2.0");
    expect(old?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const { file, name } = await downloadRelease("0.2.0");
    expect(name).toBe("RzParty-0.2.0-archivee.zip");
    const dir = mkdtempSync(join(tmpdir(), "rz-zip-"));
    try {
      execFileSync("python3", ["-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", file, dir]);
      const root = join(dir, "RzParty-0.2.0");
      expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("0.2.0");
      expect(readFileSync(join(root, "start.bat"), "utf8")).toContain("set RZ_UPDATE_URL=off");
      expect(readFileSync(join(root, "start.sh"), "utf8")).toContain("export RZ_UPDATE_URL=off");
      expect(readFileSync(join(root, "VERSION-ARCHIVEE.txt"), "utf8")).toContain("ne se met pas à jour");
      expect(() => readFileSync(join(root, "mettre-a-jour.bat"))).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    await expect(downloadRelease("9.9.9")).rejects.toThrow();
  }, 60_000);
});
