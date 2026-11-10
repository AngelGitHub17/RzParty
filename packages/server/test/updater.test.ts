import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "../src/unzip.ts";
import { applyArchive, compareVersions, installerOf, downloadRelease, freezeLauncher, isGitInstall, listReleases, parseChangelog, readChangelog, version } from "../src/updater.ts";

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
    // Notre lecteur de .zip (mises à jour) lit les archives de git.
    const entries = readZip(readFileSync(file));
    expect(entries.length).toBeGreaterThan(50);
    expect(JSON.parse(entries.find((e) => e.name === "RzParty-0.2.0/package.json")!.data.toString("utf8")).version).toBe("0.2.0");
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

  it("installe une archive par-dessus le dossier sans toucher aux profils, à Node.js ni aux réglages", () => {
    const dir = mkdtempSync(join(tmpdir(), "rz-maj-"));
    try {
      const target = join(dir, "jeu");
      mkdirSync(join(target, "data"), { recursive: true });
      writeFileSync(join(target, "data", "profils.json"), "mes profils");
      writeFileSync(join(target, "rzparty.config.json"), "{\"port\":4000}");
      writeFileSync(join(target, "package-lock.json"), "ancien");
      const zip = join(dir, "maj.zip");
      execFileSync("python3", [
        "-c",
        [
          "import sys,zipfile",
          "z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)",
          "z.writestr('RzParty/package.json','{\"version\":\"9.0.0\"}')",
          "z.writestr('RzParty/package-lock.json','nouveau')",
          "z.writestr('RzParty/packages/server/src/a.ts','export const a = 1;')",
          "z.writestr('RzParty/data/profils.json','ÉCRASÉ')",
          "z.writestr('RzParty/runtime/node','ÉCRASÉ')",
          "z.writestr('RzParty/rzparty.config.json','ÉCRASÉ')",
          "z.writestr('RzParty/../dehors.txt','ÉCRASÉ')",
          "z.close()",
        ].join("\n"),
        zip,
      ]);
      const res = applyArchive(readFileSync(zip), target);
      expect(res).toEqual({ files: 3, lockChanged: true, version: "9.0.0" });
      expect(readFileSync(join(target, "packages/server/src/a.ts"), "utf8")).toBe("export const a = 1;");
      expect(readFileSync(join(target, "data", "profils.json"), "utf8")).toBe("mes profils");
      expect(readFileSync(join(target, "rzparty.config.json"), "utf8")).toBe("{\"port\":4000}");
      expect(existsSync(join(target, "runtime"))).toBe(false);
      expect(existsSync(join(dir, "dehors.txt"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("range les installeurs publiés par système", () => {
    expect(installerOf("RzParty-1.0.0.msi", "u", 5)).toEqual({ os: "windows", name: "RzParty-1.0.0.msi", url: "u", size: 5 });
    expect(installerOf("rzparty_1.0.0_amd64.deb", "u", 5)?.os).toBe("linux");
    expect(installerOf("RzParty-1.0.0.pkg", "u", 5)?.os).toBe("mac");
    expect(installerOf("notes.txt", "u", 5)).toBeNull();
  });
});
