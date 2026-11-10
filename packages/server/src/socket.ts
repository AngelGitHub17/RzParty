import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { ERRORS, type Ack, type ClientToServerEvents, type ServerToClientEvents } from "@rzparty/shared";
import { RoomError, RoomManager } from "./rooms/RoomManager.ts";
import { randomInt } from "node:crypto";
import { createRng } from "@rzparty/shared";
import { availableModes, getMode } from "./modes/registry.ts";
import type { Room } from "./rooms/Room.ts";
import type { GameHost } from "./game/types.ts";
import type { ProfileStore } from "./profiles/ProfileStore.ts";
import type { AdminStore } from "./profiles/AdminStore.ts";
import { getMiniGame } from "@rzparty/minigames/server";
import type { Identity } from "./rooms/RoomManager.ts";
import { config, timings } from "./config.ts";
import { log } from "./log.ts";
import { installUpdate, updateStatus } from "./updater.ts";
import { clientAddress, isPrivateAddress, lanAddresses, onServerNetwork, viaUnknownProxy } from "./network.ts";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Branche Socket.IO sur le serveur HTTP et relie chaque message au RoomManager. */
export function attachSockets(httpServer: HttpServer, opts: { dev: boolean; profiles: ProfileStore; admin: AdminStore }) {
  const { profiles, admin } = opts;
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // En dev, le client Vite tourne sur un autre port de la même machine.
    cors: opts.dev ? { origin: true } : undefined,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Les grands plateaux (jusqu'à 2000 cases) font des messages lourds : on les compresse.
    perMessageDeflate: { threshold: 4096 },
    maxHttpBufferSize: 1e6,
  });

  const channel = (code: string) => `room:${code}`;

  const manager: RoomManager = new RoomManager(timings, {
    changed(code) {
      const snapshot = manager.snapshot(code);
      if (snapshot) io.to(channel(code)).emit("room:state", snapshot);
    },
    closed(code, reason, socketIds) {
      log(`Salon ${code} fermé : ${reason}`);
      for (const id of socketIds) {
        const s = io.sockets.sockets.get(id);
        s?.emit("room:closed", { reason });
        s?.leave(channel(code));
      }
    },
    detached(socketId, why) {
      const s = io.sockets.sockets.get(socketId);
      if (!s) return;
      for (const r of s.rooms) if (r.startsWith("room:")) s.leave(r);
      if (why === "kicked") s.emit("room:kicked");
      else s.emit("room:closed", { reason: "Tu as repris ta place depuis un autre appareil." });
    },
  }, availableModes);

  /** Place la socket dans le canal Socket.IO de son salon (et la retire des autres). */
  const enter = (socket: GameSocket, code: string, playerId: string | null) => {
    for (const r of socket.rooms) if (r.startsWith("room:") && r !== channel(code)) socket.leave(r);
    socket.join(channel(code));
    const snapshot = manager.snapshot(code);
    if (snapshot) socket.emit("room:state", snapshot);
    // Partie en cours : on renvoie l'état du mini-jeu à celui qui (re)arrive.
    const game = manager.getRoom(code)?.game;
    const secret = playerId ? game?.boardPrivate?.(playerId) : null;
    if (secret) socket.emit("board:private", secret);
    const replay = game?.replay(playerId);
    if (replay) {
      if (replay.state !== undefined) socket.emit("mg:state", { round: replay.round, state: replay.state });
      if (replay.private !== undefined) socket.emit("mg:private", { round: replay.round, data: replay.private });
    }
  };

  /** Ce qu'une partie peut faire pour parler aux joueurs de son salon. */
  const hostFor = (room: Room): GameHost => {
    const random = createRng(randomInt(2 ** 31));
    return {
      room,
      changed: () => manager.events.changed(room.code),
      publishMiniGame: (round, state) => io.to(channel(room.code)).emit("mg:state", { round, state }),
      sendPrivate: (playerId, round, data) => {
        const socketId = room.findPlayer(playerId)?.socketId;
        if (socketId) io.to(socketId).emit("mg:private", { round, data });
      },
      sendBoardPrivate: (playerId, data) => {
        const socketId = room.findPlayer(playerId)?.socketId;
        if (socketId) io.to(socketId).emit("board:private", data);
      },
      random,
      now: () => Date.now(),
      roundEnded: (info) => {
        const definitions = getMiniGame(info.miniGameId)?.definition.records ?? [];
        for (const playerId of info.players) {
          const profileId = room.findPlayer(playerId)?.profileId;
          if (!profileId) continue;
          profiles.recordRound(profileId, {
            miniGameId: info.miniGameId,
            won: info.winners.includes(playerId),
            records: info.records[playerId] ?? {},
            definitions,
          });
        }
      },
      gameEnded: (info) => {
        for (const playerId of info.players) {
          const p = room.findPlayer(playerId);
          if (p?.profileId && !p.isBot) profiles.recordGame(p.profileId, info.winners.includes(playerId));
        }
      },
    };
  };

  /** Profil (par son jeton) ou invité (par son pseudo). */
  const identityOf = (payload: { profileToken?: unknown; name?: unknown } | undefined): Identity | unknown => {
    if (payload?.profileToken) {
      const profile = profiles.byToken(payload.profileToken);
      profiles.touch(profile.id);
      return { name: profile.name, avatar: profile.avatar, profileId: profile.id } satisfies Identity;
    }
    return payload?.name;
  };

  /**
   * La page /hote n'est utilisable que depuis le réseau local du serveur (par défaut), jamais depuis Internet.
   * Pratique pour un serveur sans écran (conteneur LXC) : on gère tout depuis un autre PC de la maison.
   * RZ_ADMIN_FROM=local la réserve à la machine du serveur.
   */
  const isHost = (socket: GameSocket) => {
    // Derrière un proxy inconnu, l'adresse vue est celle du proxy : on refuse par prudence.
    if (viaUnknownProxy(socket.handshake.headers)) return false;
    const address = clientAddress(socket);
    // La machine du serveur elle-même : par « localhost » ou par sa propre adresse sur le réseau.
    if (address === "127.0.0.1" || address === "::1" || lanAddresses().includes(address)) return true;
    return config.adminFrom === "lan" && (isPrivateAddress(address) || onServerNetwork(address));
  };
  const requireHost = (socket: GameSocket) => {
    if (!isHost(socket)) throw new RoomError(ERRORS.notHost);
  };
  /** Page hôte : bon PC ET session ouverte avec l'identifiant de l'hôte. */
  const requireAdmin = (socket: GameSocket, token: unknown) => {
    requireHost(socket);
    admin.check(token);
  };

  // Un profil modifié se met à jour partout (salons, listes ouvertes).
  profiles.onChange = (profile, removedId) => {
    if (profile) manager.applyProfile(profile);
    if (removedId) manager.forgetProfile(removedId);
    io.emit("profiles:changed");
  };
  const detach = () => {
    profiles.onChange = () => {};
  };

  /** Exécute une action et répond par un accusé : jamais d'exception vers le réseau. */
  function handle<T>(ack: unknown, action: () => T): void {
    const reply = typeof ack === "function" ? (ack as (r: Ack<T>) => void) : () => {};
    try {
      reply({ ok: true, data: action() });
    } catch (err) {
      if (err instanceof RoomError) reply({ ok: false, error: err.message });
      else {
        log("Erreur inattendue :", err);
        reply({ ok: false, error: ERRORS.badRequest });
      }
    }
  }

  /** Comme handle, pour une action asynchrone (mise à jour). Les erreurs ordinaires sont montrées telles quelles. */
  function handleAsync<T>(ack: unknown, action: () => Promise<T>): void {
    const reply = typeof ack === "function" ? (ack as (r: Ack<T>) => void) : () => {};
    action().then(
      (data) => reply({ ok: true, data }),
      (err) => {
        if (!(err instanceof RoomError)) log("Mise à jour :", err);
        reply({ ok: false, error: err instanceof Error ? err.message.split("\n")[0]! : ERRORS.badRequest });
      },
    );
  }

  io.on("connection", (socket: GameSocket) => {
    socket.on("screen:create", (ack) =>
      handle(ack, () => {
        const room = manager.createSharedRoom(socket.id);
        enter(socket, room.code, null);
        log(`Salon ${room.code} créé (écran commun)`);
        return { code: room.code };
      }),
    );

    socket.on("screen:watch", (payload, ack) =>
      handle(ack, () => {
        const room = manager.watchRoom(socket.id, payload?.code);
        enter(socket, room.code, null);
      }),
    );

    socket.on("player:create", (payload, ack) =>
      handle(ack, () => {
        const seat = manager.createIndividualRoom(socket.id, identityOf(payload));
        enter(socket, seat.code, seat.playerId);
        log(`Salon ${seat.code} créé (écrans individuels)`);
        return seat;
      }),
    );

    socket.on("player:join", (payload, ack) =>
      handle(ack, () => {
        const seat = manager.join(socket.id, payload?.code, identityOf(payload));
        enter(socket, seat.code, seat.playerId);
        return seat;
      }),
    );

    socket.on("player:resume", (payload, ack) =>
      handle(ack, () => {
        const seat = manager.resume(socket.id, payload?.code, payload?.token);
        enter(socket, seat.code, seat.playerId);
        return seat;
      }),
    );

    socket.on("player:leave", (ack) =>
      handle(ack, () => {
        const binding = manager.bindingOf(socket.id);
        manager.leave(socket.id);
        if (binding) socket.leave(channel(binding.code));
      }),
    );

    socket.on("player:setColor", (payload, ack) => handle(ack, () => manager.setColor(socket.id, payload?.color)));
    socket.on("chef:addBot", (payload, ack) => handle(ack, () => manager.addBot(socket.id, payload?.personality)));
    socket.on("chef:removeBot", (payload, ack) => handle(ack, () => manager.removeBot(socket.id, payload?.playerId)));
    socket.on("chef:kick", (payload, ack) => handle(ack, () => manager.kick(socket.id, payload?.playerId)));
    socket.on("chef:updateSettings", (payload, ack) => handle(ack, () => manager.updateSettings(socket.id, payload)));
    socket.on("chef:start", (ack) =>
      handle(ack, () => {
        const room = manager.startGame(socket.id, (r) => {
          const mode = getMode(r.settings.mode);
          if (!mode) throw new RoomError(ERRORS.modeUnavailable);
          return mode.create(hostFor(r));
        });
        log(`Salon ${room.code} : partie lancée (${room.settings.mode})`);
      }),
    );
    socket.on("chef:backToLobby", (ack) => handle(ack, () => manager.backToLobby(socket.id)));
    socket.on("game:ready", (ack) => handle(ack, () => manager.gameReady(socket.id)));
    socket.on("game:action", (payload, ack) => handle(ack, () => manager.gameAction(socket.id, payload)));
    socket.on("game:input", (payload) => {
      try {
        manager.gameInput(socket.id, payload?.round, payload?.input);
      } catch (err) {
        log("Entrée de jeu refusée :", err);
      }
    });

    socket.on("profile:find", (payload, ack) => handle(ack, () => profiles.findByName(payload?.name)));
    socket.on("profile:create", (payload, ack) => handle(ack, () => profiles.create(payload?.name, payload?.avatar, payload?.pin)));
    socket.on("profile:unlock", (payload, ack) => handle(ack, () => profiles.unlock(payload?.profileId, payload?.pin)));
    socket.on("profile:me", (payload, ack) => handle(ack, () => profiles.byToken(payload?.token)));
    socket.on("profile:update", (payload, ack) =>
      handle(ack, () => profiles.update(payload?.token, { name: payload?.name, avatar: payload?.avatar, pin: payload?.pin })),
    );

    socket.on("admin:status", (ack) => handle(ack, () => ({ onHost: isHost(socket), configured: admin.configured })));
    socket.on("admin:setup", (payload, ack) => handle(ack, () => (requireHost(socket), { token: admin.setup(payload?.login, payload?.password) })));
    socket.on("admin:login", (payload, ack) => handle(ack, () => (requireHost(socket), { token: admin.login(payload?.login, payload?.password) })));
    socket.on("admin:logout", (payload, ack) => handle(ack, () => admin.logout(payload?.token)));
    socket.on("admin:list", (payload, ack) => handle(ack, () => (requireAdmin(socket, payload?.token), profiles.list())));
    socket.on("admin:rename", (payload, ack) => handle(ack, () => (requireAdmin(socket, payload?.token), profiles.rename(payload?.profileId, payload?.name))));
    socket.on("admin:clearPin", (payload, ack) => handle(ack, () => (requireAdmin(socket, payload?.token), profiles.clearPin(payload?.profileId))));
    socket.on("admin:resetStats", (payload, ack) => handle(ack, () => (requireAdmin(socket, payload?.token), profiles.resetStats(payload?.profileId))));
    socket.on("admin:delete", (payload, ack) => handle(ack, () => (requireAdmin(socket, payload?.token), profiles.delete(payload?.profileId))));

    socket.on("admin:updateStatus", (payload, ack) => handleAsync(ack, async () => (requireAdmin(socket, payload?.token), updateStatus())));
    socket.on("admin:updateInstall", (payload, ack) =>
      handleAsync(ack, async () => {
        requireAdmin(socket, payload?.token);
        log("Mise à jour lancée depuis la page de l'hôte.");
        return installUpdate(() => {
          io.emit("server:stopping");
          log("Redémarrage après la mise à jour.");
          // Arrêt propre (profils enregistrés) : systemd relance aussitôt la nouvelle version.
          process.kill(process.pid, "SIGTERM");
        });
      }),
    );

    socket.on("disconnect", () => manager.disconnect(socket.id));
  });

  return { io, manager, detach };
}
