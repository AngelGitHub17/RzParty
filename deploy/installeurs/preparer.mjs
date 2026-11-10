/**
 * Prépare le dossier d'un installeur (lancé par GitHub Actions après « npm ci » et « npm run build »).
 *
 *   node deploy/installeurs/preparer.mjs --kind msi|deb|pkg --out <dossier> --runtime <os-arch>=<dossier de Node.js> [...]
 *
 * Copie le jeu (fichiers suivis par git), ses dépendances, le client compilé, un ou plusieurs Node.js
 * et écrit runtime/installation.json (lu par le serveur : mise à jour toute seule).
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (name) => args[args.indexOf(`--${name}`) + 1];
const kind = opt("kind");
const out = resolve(opt("out"));
const runtimes = args.flatMap((a, i) => (a === "--runtime" ? [args[i + 1]] : []));
if (!["msi", "deb", "pkg"].includes(kind) || !out || !runtimes.length) {
  console.error("Usage : --kind msi|deb|pkg --out <dossier> --runtime <os-arch>=<dossier Node.js>");
  process.exit(1);
}
if (!existsSync(join(root, "packages/client/dist/index.html"))) throw new Error("Lance d'abord « npm run build ».");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// 1. Les fichiers du jeu suivis par git (sans .github).
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter((f) => f && !f.startsWith(".github/"));
for (const f of files) {
  const dest = join(out, f);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(root, f), dest, { verbatimSymlinks: true });
}
// 2. Client compilé et dépendances. Sous Windows, les liens vers les paquets du jeu sont recréés par le lanceur.
cpSync(join(root, "packages/client/dist"), join(out, "packages/client/dist"), { recursive: true });
cpSync(join(root, "node_modules"), join(out, "node_modules"), {
  recursive: true,
  verbatimSymlinks: true,
  filter: (src) => {
    const rel = src.slice(join(root, "node_modules").length + 1).split(/[\\/]/);
    // Outils de développement inutiles pour jouer et pour compiler une mise à jour.
    if (["typescript", "vitest", "@vitest", "@types", "concurrently", "rxjs", ".cache"].includes(rel[0])) return false;
    return !(kind === "msi" && rel[0] === "@rzparty");
  },
});
// 3. Node.js : runtime/ (Windows) ou runtime/node-<os>-<arch>/ (Linux, Mac).
for (const spec of runtimes) {
  const [id, dir] = spec.split("=");
  // Seulement Node.js et npm (pas les en-têtes C ni la documentation).
  const skip = /[\\/](include|share|doc|corepack[^\\/]*|CHANGELOG\.md|README\.md)$/;
  cpSync(dir, kind === "msi" ? join(out, "runtime") : join(out, "runtime", `node-${id}`), {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => !skip.test(src.slice(dir.length)),
  });
}
const [os, arch] = runtimes[0].split("=")[0].split("-");
writeFileSync(join(out, "runtime/installation.json"), JSON.stringify({ kind, os, arch, version }, null, 2) + "\n");
if (kind === "msi") cpSync(join(root, "deploy/installeurs/windows/RzParty.cmd"), join(out, "RzParty.cmd"));
console.log(`Dossier ${kind} prêt : ${out} (version ${version}, ${files.length} fichiers du jeu).`);
