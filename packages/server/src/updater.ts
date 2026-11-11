import { execFile } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { findInstallers, installerOf, type ChangelogEntry, type InstallerInfo, type InstallerList, type ReleaseInfo, type UpdateStatus } from "@rzparty/shared";
import { config, rootDir } from "./config.ts";
import { log } from "./log.ts";
import { readZip } from "./unzip.ts";

const run = promisify(execFile);
const isWindows = process.platform === "win32";

/** Version du jeu (package.json racine). */
export const version = (JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as { version: string }).version;

/** Le dossier est-il un clone git (mise à jour par « git pull ») ? */
export const isGitInstall = existsSync(resolve(rootDir, ".git"));

/** Installé par un installeur (.msi, .deb, .pkg) : il dépose runtime/installation.json à côté de Node.js. */
export const installKind: string | null = (() => {
  try {
    return (JSON.parse(readFileSync(resolve(rootDir, "runtime/installation.json"), "utf8")) as { kind?: string }).kind ?? "installeur";
  } catch {
    return null;
  }
})();

let restartAsked = false;
/** Une mise à jour vient d'être installée : le lanceur doit relancer le jeu. */
export function restartRequested(): boolean {
  return restartAsked;
}

/** Code de sortie qui demande au lanceur (installeurs) de relancer RzParty. */
export const RESTART_EXIT_CODE = 75;

async function git(...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: rootDir, timeout: 60_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

/** git avec un index à part (pour fabriquer l'arbre d'une ancienne version sans toucher au dossier). */
async function gitWithIndex(index: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: rootDir, timeout: 60_000, windowsHide: true, env: { ...process.env, GIT_INDEX_FILE: index } });
  return stdout.trim();
}

/** Commit et date de la version installée : par git, sinon par le fichier rempli par « git archive ». */
function readBuildInfo(): { commit: string | null; date: string | null } {
  try {
    if (isGitInstall) {
      const head = readFileSync(resolve(rootDir, ".git/HEAD"), "utf8").trim();
      const ref = head.startsWith("ref: ") ? head.slice(5) : null;
      const sha = ref ? readRef(ref) : head;
      if (sha) return { commit: sha.slice(0, 7), date: null };
    }
  } catch {
    /* on essaie le fichier d'archive */
  }
  try {
    const raw = readFileSync(resolve(rootDir, "packages/server/build-info.txt"), "utf8").trim();
    if (!raw.startsWith("$Format")) {
      const [commit, date] = raw.split("|");
      return { commit: commit || null, date: date || null };
    }
  } catch {
    /* pas d'information */
  }
  return { commit: null, date: null };
}

function readRef(ref: string): string | null {
  const loose = resolve(rootDir, ".git", ref);
  if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
  const packed = resolve(rootDir, ".git/packed-refs");
  if (!existsSync(packed)) return null;
  const line = readFileSync(packed, "utf8").split("\n").find((l) => l.endsWith(` ${ref}`));
  return line?.split(" ")[0] ?? null;
}

export const buildInfo = readBuildInfo();

/** Compare deux versions « 1.2.3 » : négatif si a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Journal des mises à jour, lu dans CHANGELOG.md :
 *   ## 0.2.0 — 4 novembre 2026
 *   - Une nouveauté
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+))?$/.exec(line);
    if (head) {
      current = { version: head[1]!, date: head[2]?.trim() ?? "", items: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) current.items.push(item[1]!.replace(/\*\*(.+?)\*\*/g, "$1"));
  }
  return entries;
}

export function readChangelog(): ChangelogEntry[] {
  try {
    return parseChangelog(readFileSync(resolve(rootDir, "CHANGELOG.md"), "utf8"));
  } catch {
    return [];
  }
}

// ─────────────────────────── Version publiée sur le site ───────────────────────────

let latest: { version: string; url: string } | null = null;

/** Dernière version annoncée par le site (null si à jour, injoignable ou désactivé). */
export function availableUpdate(): { version: string; url: string } | null {
  return latest && compareVersions(latest.version, version) > 0 ? latest : null;
}

/** Demande au site (https://rzparty.fr par défaut) la dernière version publiée. */
export async function checkForUpdate(): Promise<{ version: string; url: string } | null> {
  const base = config.updateUrl;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(6000), headers: { "user-agent": `RzParty/${version}` } });
    if (!res.ok) return availableUpdate();
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version === "string" && /^\d+\.\d+\.\d+/.test(body.version)) latest = { version: body.version, url: base };
  } catch {
    /* site injoignable : on réessaiera plus tard */
  }
  return availableUpdate();
}

/** Vérifie au démarrage puis toutes les 6 heures. `onFound` est appelé à chaque nouvelle version trouvée. */
export function watchForUpdates(onFound: (u: { version: string; url: string }) => void): () => void {
  if (!config.updateUrl) return () => {};
  let announced = "";
  const tick = async () => {
    const u = await checkForUpdate();
    if (u && u.version !== announced) {
      announced = u.version;
      onFound(u);
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 6 * 3600_000);
  timer.unref();
  return () => clearInterval(timer);
}

// ─────────────────────────── Mise à jour depuis la page /hote ───────────────────────────

let busy = false;

/** État de la mise à jour, pour la page de l'hôte. Avec git, regarde ce qui attend sur GitHub. */
export async function updateStatus(): Promise<UpdateStatus> {
  const base: UpdateStatus = {
    version,
    commit: buildInfo.commit,
    method: isGitInstall ? "git" : installKind ? "installeur" : "archive",
    update: (await checkForUpdate()) ?? null,
    pending: [],
    canInstall: false,
    autoRestart: underServiceManager(),
  };
  if (!isGitInstall) {
    base.canInstall = Boolean(base.update);
    return base;
  }
  try {
    await git("fetch", "--quiet");
    const lines = await git("log", "--format=%h%x09%s", "HEAD..@{u}");
    base.pending = lines ? lines.split("\n").slice(0, 30).map((l) => {
      const [hash, ...rest] = l.split("\t");
      return { hash: hash!, subject: rest.join("\t") };
    }) : [];
    base.canInstall = base.pending.length > 0;
  } catch (err) {
    base.error = "Impossible de joindre GitHub depuis ce serveur.";
    log("Vérification git impossible :", (err as Error).message);
  }
  return base;
}

/** Lancé par systemd (conteneur Proxmox) : il relance le jeu tout seul après la mise à jour. */
function underServiceManager(): boolean {
  return Boolean(process.env.INVOCATION_ID || process.env.RZ_AUTO_RESTART === "1");
}

/**
 * Installe la mise à jour : git pull, dépendances si besoin, compilation du client.
 * Renvoie true si le serveur va redémarrer tout seul.
 */
export async function installUpdate(onRestart: () => void): Promise<{ restarting: boolean; log: string[] }> {
  if (!isGitInstall) return installFromArchive(onRestart);
  if (busy) throw new Error("Une mise à jour est déjà en cours.");
  busy = true;
  const out: string[] = [];
  try {
    const before = await git("rev-parse", "HEAD");
    out.push(await git("pull", "--ff-only"));
    const changed = await git("diff", "--name-only", before, "HEAD");
    const npm = isWindows ? "npm.cmd" : "npm";
    const npmRun = (args: string[]) => run(npm, args, { cwd: rootDir, timeout: 10 * 60_000, windowsHide: true, shell: isWindows });
    if (changed.split("\n").includes("package-lock.json")) {
      out.push("Installation des dépendances…");
      await npmRun(["ci", "--no-audit", "--no-fund"]);
    }
    out.push("Compilation du client…");
    await npmRun(["run", "build"]);
    const restarting = underServiceManager();
    if (restarting) setTimeout(onRestart, 800);
    out.push(restarting ? "Redémarrage du serveur…" : "Terminé : relance RzParty pour utiliser la nouvelle version.");
    return { restarting, log: out };
  } finally {
    busy = false;
  }
}

// ─────────────────────────── Archive à télécharger (mode site) ───────────────────────────

const cacheDir = resolve(rootDir, "data/cache");
let building: Promise<string> | null = null;

/** Archive .zip du jeu pour la version en ligne (créée une fois par commit, avec « git archive »). */
export async function downloadArchive(): Promise<{ file: string; name: string }> {
  if (!isGitInstall) throw new Error("Téléchargement indisponible sur ce serveur.");
  const name = `RzParty-${version}.zip`;
  const commit = (await git("rev-parse", "--short", "HEAD")) || "local";
  const file = resolve(cacheDir, `RzParty-${version}-${commit}.zip`);
  if (existsSync(file) && statSync(file).size > 0) return { file, name };
  building ??= (async () => {
    mkdirSync(cacheDir, { recursive: true });
    // Les archives des anciennes versions (« -figee ») sont gardées : elles ne changent plus.
    for (const old of readdirSync(cacheDir)) if (old.endsWith(".zip") && !old.endsWith("-figee.zip")) rmSync(resolve(cacheDir, old), { force: true });
    await git("archive", "--format=zip", "--prefix=RzParty/", "-o", file, "HEAD");
    return file;
  })().finally(() => (building = null));
  await building;
  return { file, name };
}

// ─────────────────────────── Anciennes versions ───────────────────────────

let releasesCache: { head: string; list: (ReleaseInfo & { sha: string })[] } | null = null;

/** Les versions publiées, de la plus récente à la plus ancienne (d'après l'historique de package.json). */
export async function listReleases(): Promise<ReleaseInfo[]> {
  return (await releases()).map(({ sha: _sha, ...r }) => r);
}

async function releases(): Promise<(ReleaseInfo & { sha: string })[]> {
  if (!isGitInstall) return [];
  const head = await git("rev-parse", "HEAD");
  if (releasesCache?.head === head) return releasesCache.list;
  const lines = (await git("log", "--format=%H %cs", "--", "package.json")).split("\n").filter(Boolean);
  const list: (ReleaseInfo & { sha: string })[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const [sha, date] = line.split(" ") as [string, string];
    let v: string;
    try {
      v = (JSON.parse(await git("show", `${sha}:package.json`)) as { version: string }).version;
    } catch {
      continue;
    }
    // La version en ligne correspond à HEAD, même si package.json n'a pas bougé depuis.
    if (seen.has(v)) continue;
    seen.add(v);
    list.push({ version: v, date, commit: sha.slice(0, 7), latest: v === version, sha: v === version ? head : sha });
  }
  // Version en cours pas encore enregistrée dans git (dossier de travail) : elle reste la première.
  if (!list.some((r) => r.version === version)) list.unshift({ version, date: new Date().toISOString().slice(0, 10), commit: head.slice(0, 7), latest: true, sha: head });
  releasesCache = { head, list };
  return list;
}

/** Ce qui change dans une version archivée : plus de mise à jour automatique ni de « mettre à jour ». */
export function freezeLauncher(path: string, content: string): string {
  const off = path.endsWith(".bat") ? "set RZ_UPDATE_URL=off" : "export RZ_UPDATE_URL=off";
  const lines = content.split("\n");
  // Juste après « @echo off » ou la ligne #!.
  const at = lines.findIndex((l) => /^@echo off|^#!/.test(l.trim()));
  lines.splice(at + 1, 0, off);
  return lines.join("\n");
}

const FROZEN_NOTE = (v: string) => `RzParty ${v} — version archivée

Cette version ne se met pas à jour toute seule : elle reste telle quelle.
Pour avoir toujours la dernière version (mises à jour automatiques), télécharge-la sur https://rzparty.fr

Lancement : start.bat (Windows) ou start.sh (Linux, Mac).
`;

/** Archive .zip d'une version : la dernière (qui se met à jour) ou une ancienne, figée. */
export async function downloadRelease(wanted: string): Promise<{ file: string; name: string }> {
  if (wanted === version) return downloadArchive();
  const release = (await releases()).find((r) => r.version === wanted);
  if (!release) throw new Error(`La version ${wanted} n'existe pas.`);
  const name = `RzParty-${wanted}-archivee.zip`;
  const file = resolve(cacheDir, `RzParty-${wanted}-${release.commit}-figee.zip`);
  if (existsSync(file) && statSync(file).size > 0) return { file, name };
  mkdirSync(cacheDir, { recursive: true });
  const index = resolve(cacheDir, `index-${release.commit}`);
  const tmp = resolve(cacheDir, `tmp-${release.commit}`);
  try {
    await gitWithIndex(index, "read-tree", release.sha);
    const put = async (path: string, content: string, mode: string) => {
      writeFileSync(tmp, content);
      const blob = await git("hash-object", "-w", tmp);
      await gitWithIndex(index, "update-index", "--add", "--cacheinfo", `${mode},${blob},${path}`);
    };
    for (const [path, mode] of [["start.bat", "100644"], ["start.sh", "100755"]] as const) {
      const content = await git("show", `${release.sha}:${path}`).catch(() => null);
      if (content !== null) await put(path, freezeLauncher(path, content), mode);
    }
    for (const path of ["mettre-a-jour.bat", "mettre-a-jour.sh", "deploy/windows/mettre-a-jour.ps1"]) {
      await gitWithIndex(index, "update-index", "--force-remove", path).catch(() => {});
    }
    await put("VERSION-ARCHIVEE.txt", FROZEN_NOTE(wanted), "100644");
    const tree = await gitWithIndex(index, "write-tree");
    await git("archive", "--format=zip", `--prefix=RzParty-${wanted}/`, "-o", file, tree);
  } finally {
    rmSync(index, { force: true });
    rmSync(tmp, { force: true });
  }
  return { file, name };
}

// ─────────────────────────── Mise à jour d'un dossier .zip ou installé ───────────────────────────

/** Ce que la mise à jour ne touche jamais : profils, réglages, Node.js fourni par l'installeur, dépendances. */
const KEEP = new Set(["data", "node_modules", "runtime", ".git", "rzparty.config.json"]);

/** Écrit les fichiers d'une archive du jeu par-dessus le dossier (exporté pour les tests). */
export function applyArchive(zip: Buffer, target: string): { files: number; lockChanged: boolean; version: string } {
  const entries = readZip(zip);
  const pkg = entries.find((e) => /^[^/]+\/package\.json$/.test(e.name));
  if (!pkg) throw new Error("Archive inattendue : package.json introuvable.");
  const prefix = pkg.name.slice(0, pkg.name.indexOf("/") + 1);
  const newVersion = (JSON.parse(pkg.data.toString("utf8")) as { version: string }).version;
  const lockPath = resolve(target, "package-lock.json");
  const oldLock = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : "";
  let files = 0;
  for (const e of entries) {
    if (!e.name.startsWith(prefix)) continue;
    const rel = e.name.slice(prefix.length);
    if (!rel || rel.split("/").some((part) => part === ".." || part === "")) continue;
    if (KEEP.has(rel.split("/")[0]!)) continue;
    const dest = resolve(target, ...rel.split("/"));
    if (!dest.startsWith(resolve(target) + sep)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, e.data);
    if (e.mode & 0o111 && !isWindows) chmodSync(dest, 0o755);
    files++;
  }
  const lockChanged = existsSync(lockPath) && readFileSync(lockPath, "utf8") !== oldLock;
  return { files, lockChanged, version: newVersion };
}

async function installFromArchive(onRestart: () => void): Promise<{ restarting: boolean; log: string[] }> {
  if (busy) throw new Error("Une mise à jour est déjà en cours.");
  const base = config.updateUrl;
  if (!base) throw new Error("Les mises à jour sont désactivées sur cette version (version archivée ou RZ_UPDATE_URL=off).");
  busy = true;
  const out: string[] = [];
  try {
    const update = await checkForUpdate();
    if (!update) throw new Error("RzParty est déjà à jour.");
    out.push(`Téléchargement de la version ${update.version}…`);
    const res = await fetch(`${base}/telecharger`, { signal: AbortSignal.timeout(10 * 60_000), headers: { "user-agent": `RzParty/${version}` } });
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}).`);
    const zip = Buffer.from(await res.arrayBuffer());
    out.push("Installation des fichiers…");
    const { files, lockChanged } = applyArchive(zip, rootDir);
    out.push(`${files} fichiers mis à jour.`);
    const npm = isWindows ? "npm.cmd" : "npm";
    const npmRun = (args: string[]) => run(npm, args, { cwd: rootDir, timeout: 10 * 60_000, windowsHide: true, shell: isWindows });
    if (lockChanged || !existsSync(resolve(rootDir, "node_modules"))) {
      out.push("Installation des dépendances…");
      await npmRun(["ci", "--no-audit", "--no-fund"]);
    }
    out.push("Compilation du client…");
    await npmRun(["run", "build"]);
    const restarting = underServiceManager();
    if (restarting) {
      restartAsked = true;
      setTimeout(onRestart, 800);
    }
    out.push(restarting ? "Redémarrage de RzParty…" : "Terminé : relance RzParty pour utiliser la nouvelle version.");
    log(`Mise à jour installée : ${update.version}.`);
    return { restarting, log: out };
  } finally {
    busy = false;
  }
}

// ─────────────────────────── Installeurs (publiés sur GitHub) ───────────────────────────

/** Dépôt GitHub où GitHub Actions publie les installeurs de chaque version. */
export const GITHUB_REPO = process.env.RZ_GITHUB_REPO || "AngelGitHub17/RzParty";
let installersCache: { at: number; list: InstallerList } | null = null;

/** Rangement d'un fichier publié : .msi → Windows, .deb → Linux, .pkg → Mac. */
export { installerOf };

let installersWarned = false;
const GITHUB_TOKEN = process.env.RZ_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";

function githubHeaders(accept = "application/vnd.github+json"): Record<string, string> {
  return {
    "user-agent": `RzParty/${version}`,
    accept,
    // Un jeton GitHub (lecture seule) est indispensable si le dépôt est privé, et lève la limite de 60 demandes par heure.
    ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  };
}

/** Installeurs connus du serveur (avec l'adresse API de chaque fichier). */
let installerAssets = new Map<string, InstallerInfo>();

/**
 * Les installeurs de la version en ligne (ou de la dernière publiée), d'après les releases GitHub.
 * Avec un jeton, ils sont servis par ce serveur (/telecharger/installeur/…) : ça marche aussi
 * quand le dépôt GitHub est privé (les visiteurs n'ont alors pas accès aux fichiers de GitHub).
 */
export async function listInstallers(): Promise<InstallerList> {
  const fresh = installersCache && Date.now() - installersCache.at < (installersCache.list.files.length ? 15 * 60_000 : 2 * 60_000);
  if (fresh) return installersCache!.list;
  try {
    const found = await findInstallers((url) => fetch(url, { signal: AbortSignal.timeout(8000), headers: githubHeaders() }), version, GITHUB_REPO);
    installerAssets = new Map(found.files.map((f) => [f.name, f]));
    const files = found.files.map(({ asset, ...f }) => (GITHUB_TOKEN && asset ? { ...f, url: `/telecharger/installeur/${encodeURIComponent(f.name)}` } : f));
    installersCache = { at: Date.now(), list: { release: found.release, files } };
    if (!files.length && !installersWarned) {
      installersWarned = true;
      log("Installeurs : aucun trouvé sur GitHub. Si le dépôt est privé, ajoute un jeton en lecture seule : RZ_GITHUB_TOKEN=…");
    }
  } catch (err) {
    if (!installersWarned) {
      installersWarned = true;
      const why = err instanceof Error ? err.message : String(err);
      log(
        `Installeurs : GitHub ne répond pas (${why}).` +
          (/404/.test(why) && !GITHUB_TOKEN ? " Le dépôt est sans doute privé : ajoute un jeton GitHub en lecture seule (RZ_GITHUB_TOKEN=…)." : " La page de présentation essaiera directement."),
      );
    }
    installersCache = { at: Date.now(), list: installersCache?.list ?? { release: null, files: [] } };
  }
  return installersCache.list;
}

const installerDownloads = new Map<string, Promise<string>>();

/** Télécharge (une fois, puis garde en cache) un installeur depuis GitHub, avec le jeton du serveur. */
export async function installerFile(name: string): Promise<{ file: string; info: InstallerInfo }> {
  if (!installerAssets.size) await listInstallers();
  const info = installerAssets.get(name);
  if (!info?.asset || !GITHUB_TOKEN) throw new Error("Installeur inconnu.");
  const dir = resolve(cacheDir, "installeurs");
  const file = resolve(dir, name);
  if (existsSync(file) && statSync(file).size === info.size) return { file, info };
  let pending = installerDownloads.get(name);
  if (!pending) {
    pending = (async () => {
      mkdirSync(dir, { recursive: true });
      // On ne garde que les installeurs actuels.
      for (const old of readdirSync(dir)) if (!installerAssets.has(old)) rmSync(resolve(dir, old), { force: true });
      const res = await fetch(info.asset!, { headers: githubHeaders("application/octet-stream"), signal: AbortSignal.timeout(10 * 60_000) });
      if (!res.ok || !res.body) throw new Error(`GitHub a répondu ${res.status}`);
      const tmp = `${file}.part`;
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
      renameSync(tmp, file);
      return file;
    })().finally(() => installerDownloads.delete(name));
    installerDownloads.set(name, pending);
  }
  return { file: await pending, info };
}
