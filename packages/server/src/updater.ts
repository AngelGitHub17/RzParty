import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { ChangelogEntry, UpdateStatus } from "@rzparty/shared";
import { config, rootDir } from "./config.ts";
import { log } from "./log.ts";

const run = promisify(execFile);
const isWindows = process.platform === "win32";

/** Version du jeu (package.json racine). */
export const version = (JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as { version: string }).version;

/** Le dossier est-il un clone git (mise à jour par « git pull ») ? */
export const isGitInstall = existsSync(resolve(rootDir, ".git"));

async function git(...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: rootDir, timeout: 60_000, windowsHide: true });
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
    method: isGitInstall ? "git" : "archive",
    update: (await checkForUpdate()) ?? null,
    pending: [],
    canInstall: false,
    autoRestart: underServiceManager(),
  };
  if (!isGitInstall) return base;
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
  if (!isGitInstall) throw new Error("Ce dossier n'a pas été installé avec git : utilise « mettre-a-jour.bat ».");
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
    for (const old of readdirSync(cacheDir)) if (old.endsWith(".zip")) rmSync(resolve(cacheDir, old), { force: true });
    await git("archive", "--format=zip", "--prefix=RzParty/", "-o", file, "HEAD");
    return file;
  })().finally(() => (building = null));
  await building;
  return { file, name };
}
