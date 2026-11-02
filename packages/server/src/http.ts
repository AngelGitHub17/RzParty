import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { GAME_NAME, type ServerInfo } from "@rzparty/shared";
import { config, rootDir } from "./config.ts";
import { lanAddresses } from "./network.ts";
import { attachSockets } from "./socket.ts";
import type { ProfileStore } from "./profiles/ProfileStore.ts";
import type { AdminStore } from "./profiles/AdminStore.ts";

const clientDist = resolve(rootDir, "packages/client/dist");
export const version = (JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as { version: string }).version;

/** Pages de l'application : toutes servent le même index.html, le client choisit la vue. */
const APP_ROUTES = ["/", "/ecran", "/manette", "/jouer", "/hote"];

export class ClientNotBuiltError extends Error {}

/** Un serveur RzParty en marche sur un port donné. */
export interface RunningServer {
  port: number;
  stop(): Promise<void>;
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
  }));

  if (!config.dev) {
    if (!existsSync(resolve(clientDist, "index.html"))) {
      throw new ClientNotBuiltError("Le client n'est pas compilé. Lance « npm start » depuis le dossier RzParty.");
    }
    await app.register(fastifyStatic, { root: clientDist, index: false });
    for (const route of APP_ROUTES) app.get(route, (_req, reply) => reply.sendFile("index.html"));
    app.setNotFoundHandler((_req, reply) => reply.code(404).type("text/plain; charset=utf-8").send("Page introuvable."));
  }

  const { io, manager, detach } = attachSockets(app.server, { dev: config.dev, profiles: deps.profiles, admin: deps.admin });

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
