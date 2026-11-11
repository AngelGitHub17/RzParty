import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { GAME_NAME, type ServerInfo } from "@rzparty/shared";
import { config, rootDir } from "./config.ts";
import { lanAddresses } from "./network.ts";
import { attachSockets } from "./socket.ts";
import { availableUpdate, buildInfo, downloadArchive, downloadRelease, GITHUB_REPO, installerFile, listInstallers, listReleases, readChangelog, version } from "./updater.ts";
import type { ProfileStore } from "./profiles/ProfileStore.ts";
import type { AdminStore } from "./profiles/AdminStore.ts";

const clientDist = resolve(rootDir, "packages/client/dist");
export { version };

/** Pages de l'application : toutes servent le même index.html, le client choisit la vue. */
const APP_ROUTES = ["/", "/accueil", "/ecran", "/manette", "/jouer", "/hote"];

export class ClientNotBuiltError extends Error {}

/** Un serveur RzParty en marche sur un port donné. */
export interface RunningServer {
  port: number;
  stop(): Promise<void>;
  /** Parties en cours (pour ne pas mettre à jour au milieu d'une partie). */
  activity(): { rooms: number; games: number; players: number };
}

/**
 * Démarre le serveur HTTP + WebSocket sur `port`.
 * Lève l'erreur Node d'origine si le port est occupé (code EADDRINUSE).
 */
export async function startServer(port: number, deps: { profiles: ProfileStore; admin: AdminStore }): Promise<RunningServer> {
  const app: FastifyInstance = Fastify({ logger: false });

  app.get("/api/info", async (): Promise<ServerInfo> => ({
    name: GAME_NAME,
    version,
    port,
    lanAddresses: lanAddresses(),
    ...(config.publicUrl ? { publicUrl: config.publicUrl } : {}),
    ...(config.site ? { site: true } : {}),
    ...(availableUpdate() ? { update: availableUpdate()! } : {}),
  }));

  // Version et journal des mises à jour : lus par les serveurs locaux et la page de présentation.
  app.get("/api/version", async (_req, reply) => {
    reply.header("access-control-allow-origin", "*").header("cache-control", "no-cache");
    return { version, commit: buildInfo.commit, download: config.site ? "/telecharger" : null };
  });
  app.get("/api/mises-a-jour", async (_req, reply) => {
    reply.header("access-control-allow-origin", "*").header("cache-control", "no-cache");
    return { version, commit: buildInfo.commit, entries: readChangelog() };
  });

  if (config.site) {
    app.get("/api/installeurs", async (_req, reply) => {
      reply.header("access-control-allow-origin", "*").header("cache-control", "no-cache");
      const list = await listInstallers();
      return { version, repo: GITHUB_REPO, ...list };
    });
    app.get("/api/versions", async (_req, reply) => {
      reply.header("access-control-allow-origin", "*").header("cache-control", "no-cache");
      return { current: version, releases: await listReleases().catch(() => []) };
    });
    // Installeurs servis par ce serveur (dépôt GitHub privé : les visiteurs n'y ont pas accès directement).
    app.get<{ Params: { name: string } }>("/telecharger/installeur/:name", async (req, reply) => {
      try {
        const { file, info } = await installerFile(req.params.name);
        return reply
          .type(info.os === "windows" ? "application/x-msi" : info.os === "linux" ? "application/vnd.debian.binary-package" : "application/octet-stream")
          .header("content-disposition", `attachment; filename="${info.name}"`)
          .header("content-length", String(info.size))
          .send(createReadStream(file));
      } catch (err) {
        return reply.code(404).type("text/plain; charset=utf-8").send(`Installeur indisponible. ${(err as Error).message}`);
      }
    });
    app.get<{ Params: { version: string } }>("/telecharger/:version", async (req, reply) => {
      const wanted = req.params.version;
      if (!/^\d+\.\d+\.\d+$/.test(wanted)) return reply.code(404).type("text/plain; charset=utf-8").send("Version inconnue.");
      try {
        const { file, name } = await downloadRelease(wanted);
        return reply
          .type("application/zip")
          .header("content-disposition", `attachment; filename="${name}"`)
          .header("cache-control", "no-cache")
          .send(createReadStream(file));
      } catch (err) {
        return reply.code(404).type("text/plain; charset=utf-8").send(`Téléchargement indisponible. ${(err as Error).message}`);
      }
    });
    app.get("/telecharger", async (_req, reply) => {
      try {
        const { file, name } = await downloadArchive();
        return reply
          .type("application/zip")
          .header("content-disposition", `attachment; filename="${name}"`)
          .header("cache-control", "no-cache")
          .send(createReadStream(file));
      } catch (err) {
        return reply.code(503).type("text/plain; charset=utf-8").send(`Téléchargement indisponible pour le moment. ${(err as Error).message}`);
      }
    });
  }

  if (!config.dev) {
    if (!existsSync(resolve(clientDist, "index.html"))) {
      throw new ClientNotBuiltError("Le client n'est pas compilé. Lance « npm start » depuis le dossier RzParty.");
    }
    await app.register(fastifyStatic, { root: clientDist, index: false });
    const hasSite = existsSync(resolve(clientDist, "site.html"));
    for (const route of APP_ROUTES) {
      const page = route === "/" && config.site && hasSite ? "site.html" : "index.html";
      app.get(route, (_req, reply) => reply.sendFile(page));
    }
    app.setNotFoundHandler((_req, reply) => reply.code(404).type("text/plain; charset=utf-8").send("Page introuvable."));
  }

  const { io, manager, detach } = attachSockets(app.server, { dev: config.dev, profiles: deps.profiles, admin: deps.admin });

  // Activité du serveur, pour la mise à jour automatique : seulement depuis la machine elle-même.
  app.get("/api/activite", async (req, reply) => {
    const ip = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";
    if ((ip !== "127.0.0.1" && ip !== "::1") || req.headers["x-forwarded-for"]) return reply.code(403).send({ error: "interdit" });
    return manager.activity();
  });

  try {
    await app.listen({ port, host: config.host });
  } catch (err) {
    detach();
    manager.dispose();
    io.close();
    await app.close().catch(() => {});
    throw err;
  }

  return {
    port,
    activity: () => manager.activity(),
    async stop() {
      detach();
      manager.dispose();
      // Prévient les navigateurs que le serveur s'arrête volontairement.
      io.emit("server:stopping");
      io.close();
      await app.close();
    },
  };
}
