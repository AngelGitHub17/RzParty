import { exec } from "node:child_process";
import { GAME_NAME } from "@rzparty/shared";
import { resolve } from "node:path";
import { config, isValidPort, rootDir, saveHostSettings, settingsFile } from "./config.ts";
import { ProfileStore } from "./profiles/ProfileStore.ts";
import { AdminStore } from "./profiles/AdminStore.ts";
import { ClientNotBuiltError, startServer, version, type RunningServer } from "./http.ts";
import { HostConsole } from "./console.ts";
import { lanAddresses } from "./network.ts";
import { log } from "./log.ts";
import { isGitInstall, watchForUpdates } from "./updater.ts";

const hostConsole = new HostConsole();
/** Profils des joueurs : un seul magasin, conservé même quand le port change. */
const profiles = new ProfileStore(resolve(rootDir, "data"));
/** Compte de l'hôte pour la page /hote (supprimer data/admin.json pour le réinitialiser). */
const admin = new AdminStore(resolve(rootDir, "data"));
let server: RunningServer | null = null;

function isPortInUse(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === "EADDRINUSE" || (err as NodeJS.ErrnoException)?.code === "EACCES";
}

function portProblem(port: number, err: unknown): string {
  return (err as NodeJS.ErrnoException).code === "EACCES"
    ? `Le système refuse d'utiliser le port ${port} (droits insuffisants).`
    : `Le port ${port} est déjà utilisé, peut-être par un autre RzParty ouvert dans une autre fenêtre.`;
}

/** Demande un port à l'hôte. Renvoie null s'il appuie seulement sur Entrée. */
async function askPort(question: string): Promise<number | null> {
  for (;;) {
    const answer = await hostConsole.ask(question);
    if (!answer) return null;
    const port = Number(answer);
    if (isValidPort(port)) return port;
    console.log("  Ce n'est pas un port valide : entre un nombre entre 1 et 65535 (par exemple 8080).");
  }
}

function rememberPort(port: number): void {
  if (config.portFromEnv) return;
  try {
    saveHostSettings({ port });
  } catch (err) {
    console.log(`  Impossible d'enregistrer le port dans ${settingsFile} :`, (err as Error).message);
  }
}

function printBanner(port: number): void {
  const addresses = lanAddresses();
  const publicPort = config.dev ? 5173 : port;
  const localUrl = `http://localhost:${publicPort}`;
  console.log("");
  console.log(`  ${GAME_NAME} ${version} est lancé${config.dev ? " (mode développement)" : ""} sur le port ${port}.`);
  console.log("");
  if (config.publicUrl) console.log(`  Adresse publique  : ${config.publicUrl}`);
  console.log(`  Sur ce PC         : ${localUrl}`);
  if (addresses[0]) console.log(`  Sur le réseau     : http://${addresses[0]}:${publicPort}`);
  for (const extra of addresses.slice(1)) console.log(`  Autre adresse     : http://${extra}:${publicPort}`);
  if (!addresses.length) console.log("  Aucun réseau détecté : seul ce PC peut jouer.");
  console.log("");
  console.log(`  Gérer les profils : ${localUrl}/hote (${config.adminFrom === "lan" ? "depuis le réseau local" : "sur ce PC uniquement"})`);
  console.log("");
  if (!config.publicUrl) console.log("  Les joueurs doivent être sur le même réseau que ce PC.");
  if (hostConsole.interactive && !config.dev) {
    console.log("  Ctrl+P : changer de port   Ctrl+O : ouvrir le jeu   Ctrl+C : arrêter");
  } else {
    console.log("  Ctrl+C pour arrêter le serveur.");
  }
  console.log("");
}

/**
 * Démarre sur `port`. Si le port est occupé, propose d'en choisir un autre (enregistré ensuite).
 * Renvoie le serveur lancé, ou null si l'hôte renonce.
 */
async function launch(port: number): Promise<RunningServer | null> {
  for (;;) {
    try {
      return await startServer(port, { profiles, admin });
    } catch (err) {
      if (err instanceof ClientNotBuiltError) {
        console.error(`\n  ${err.message}\n`);
        return null;
      }
      if (!isPortInUse(err)) throw err;
      console.log(`\n  ${portProblem(port, err)}`);
      if (!hostConsole.interactive) {
        console.log("  Choisis un autre port avec la variable RZ_PORT, par exemple : set RZ_PORT=8080\n");
        return null;
      }
      const next = await askPort("  Tape un autre port puis Entrée (ou Entrée seule pour quitter) : ");
      if (next === null) return null;
      port = next;
    }
  }
}

async function changePort(): Promise<void> {
  if (!server) return;
  console.log("");
  console.log(`  Port actuel : ${server.port}. Les salons en cours seront fermés et les joueurs devront`);
  console.log("  rouvrir le jeu avec la nouvelle adresse.");
  const next = await askPort("  Nouveau port (Entrée pour annuler) : ");
  if (next === null || next === server.port) {
    console.log("  Port inchangé.\n");
    return;
  }
  const previous = server.port;
  await server.stop();
  server = null;
  try {
    server = await startServer(next, { profiles, admin });
  } catch (err) {
    if (!isPortInUse(err)) throw err;
    console.log(`\n  ${portProblem(next, err)} Retour au port ${previous}.`);
    server = await startServer(previous, { profiles, admin });
    printBanner(previous);
    return;
  }
  rememberPort(next);
  log(`Port changé : ${previous} → ${next}${config.portFromEnv ? "" : " (enregistré pour les prochains lancements)"}`);
  printBanner(next);
}

function openInBrowser(port: number): void {
  const url = `http://localhost:${config.dev ? 5173 : port}`;
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* Pas grave si aucun navigateur ne s'ouvre : l'adresse est affichée dans la console. */
  });
}

async function shutdown(code = 0): Promise<never> {
  hostConsole.stop();
  log("Arrêt du serveur…");
  await server?.stop().catch(() => {});
  profiles.flush();
  process.exit(code);
}

async function main(): Promise<void> {
  const started = await launch(config.port);
  if (!started) {
    hostConsole.stop();
    process.exit(1);
  }
  server = started;
  if (server.port !== config.port) rememberPort(server.port);
  printBanner(server.port);

  if (!config.dev) {
    hostConsole.onCtrl("P", changePort);
    hostConsole.onCtrl("O", () => {
      if (server) openInBrowser(server.port);
    });
  }
  // En mode brut, Ctrl+C n'envoie plus de signal : on le gère nous-mêmes.
  hostConsole.onCtrl("C", () => shutdown(0));
  if (!config.dev) hostConsole.start();

  if (config.openBrowser) openInBrowser(server.port);

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  // Prévient l'hôte quand une nouvelle version est publiée sur le site.
  watchForUpdates((u) => {
    console.log("");
    console.log(`  ★ Nouvelle version de ${GAME_NAME} disponible : ${u.version} (tu as la ${version}).`);
    console.log(isGitInstall
      ? "    Installe-la depuis la page /hote, rubrique « Mise à jour »."
      : `    Ferme ${GAME_NAME}, puis double-clique sur « mettre-a-jour.bat » (journal : ${u.url}/#mises-a-jour).`);
    console.log("");
  });
}

main().catch((err) => {
  console.error("\n  Le serveur n'a pas pu démarrer :", err);
  hostConsole.stop();
  process.exit(1);
});
