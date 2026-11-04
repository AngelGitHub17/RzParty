import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "@rzparty/shared";

const args = new Set(process.argv.slice(2));

/** Dossier racine du projet RzParty. */
export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Réglages de l'hôte, conservés entre deux lancements (créé au premier changement). */
export const settingsFile = resolve(rootDir, "rzparty.config.json");

export interface HostSettings {
  port: number;
}

export function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function loadHostSettings(): HostSettings {
  const settings: HostSettings = { port: DEFAULT_PORT };
  try {
    if (existsSync(settingsFile)) {
      const saved = JSON.parse(readFileSync(settingsFile, "utf8")) as Partial<HostSettings>;
      if (isValidPort(saved.port)) settings.port = saved.port;
    }
  } catch {
    console.warn(`Le fichier ${settingsFile} est illisible : les réglages par défaut sont utilisés.`);
  }
  return settings;
}

export function saveHostSettings(settings: HostSettings): void {
  writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

const envPort = Number(process.env.RZ_PORT);

export const config = {
  /** Port d'écoute : RZ_PORT si défini, sinon celui enregistré, sinon 5555. */
  port: isValidPort(envPort) ? envPort : loadHostSettings().port,
  /** Vrai si le port est imposé par la variable RZ_PORT (il n'est alors pas enregistré). */
  portFromEnv: isValidPort(envPort),
  host: process.env.RZ_HOST ?? "0.0.0.0",
  /** En mode dev, Vite sert le client sur son propre port ; le serveur ne sert que l'API. */
  dev: args.has("--dev"),
  /** Ouvre le navigateur de l'hôte au démarrage (désactivable avec RZ_NO_OPEN=1). */
  openBrowser: !args.has("--dev") && process.env.RZ_NO_OPEN !== "1",
  /** Adresse publique du jeu (ex. https://rzparty.fr) : affichée et mise dans le QR code. */
  publicUrl: cleanUrl(process.env.RZ_PUBLIC_URL),
  /** Vrai si un proxy (Caddy, Nginx Proxy Manager…) est devant : l'adresse du joueur vient de X-Forwarded-For. */
  trustProxy: process.env.RZ_TRUST_PROXY === "1",
  /** D'où la page /hote est accessible : « local » (ce PC) ou « lan » (tout le réseau local, jamais Internet). */
  adminFrom: process.env.RZ_ADMIN_FROM === "lan" ? ("lan" as const) : ("local" as const),
  /** Serveur en ligne (RZ_SITE=1) : page de présentation sur « / », téléchargement du jeu, journal des versions. */
  site: process.env.RZ_SITE === "1",
  /** Site interrogé pour savoir si une nouvelle version existe (RZ_UPDATE_URL=off pour ne pas vérifier). */
  updateUrl: process.env.RZ_SITE === "1" || process.env.RZ_UPDATE_URL === "off" ? undefined : cleanUrl(process.env.RZ_UPDATE_URL || "https://rzparty.fr"),
};

function cleanUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Délais du salon, en millisecondes. */
export const timings = {
  /** Temps laissé au chef déconnecté pour revenir avant de passer le rôle au suivant. */
  chefGrace: 10_000,
  /** Temps avant de libérer la place d'un joueur déconnecté pendant le salon. */
  lobbySeatHold: 90_000,
  /** Temps avant de fermer un salon où plus personne n'est connecté. */
  roomIdle: 5 * 60_000,
};
