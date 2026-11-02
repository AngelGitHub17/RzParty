import {
  BOT_PERSONALITIES,
  ERRORS,
  MIN_PLAYERS_TO_START,
  PLAYER_COLORS,
  applySettingsPatch,
  isBotPersonality,
  isValidRoomCode,
  normalizeRoomCode,
  sanitizeName,
  normalizeAvatar,
  randomAvatar,
  createRng,
  type Avatar,
  type DisplayMode,
  type GameModeId,
  type PublicProfile,
  type RoomSnapshot,
  type Seat,
} from "@rzparty/shared";
import { newPlayerId, newRoomCode, newToken } from "./ids.ts";
import { Room, type PlayerRecord } from "./Room.ts";
import type { GameSession } from "../game/types.ts";

/** Erreur « prévue » : son message est affiché tel quel au joueur. */
export class RoomError extends Error {}

export interface RoomTimings {
  chefGrace: number;
  lobbySeatHold: number;
  roomIdle: number;
}

export interface RoomManagerEvents {
  /** L'état d'un salon a changé : il faut rediffuser son instantané. */
  changed(code: string): void;
  /** Le salon est fermé ; les sockets listées doivent être prévenues. */
  closed(code: string, reason: string, socketIds: string[]): void;
  /** Une socket a perdu sa place (exclusion ou reprise depuis un autre appareil). */
  detached(socketId: string, why: "kicked" | "replaced"): void;
}

/** Qui s'assoit : un profil, ou un invité (simple pseudo). */
export interface Identity {
  name: string;
  avatar: Avatar;
  profileId: string | null;
}

/** Avatar stable pour un invité, tiré de son pseudo. */
function guestAvatar(name: string): Avatar {
  let seed = 0;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return randomAvatar(createRng(seed));
}

/** Ce à quoi une socket est rattachée. */
type Binding = { code: string; kind: "screen" } | { code: string; kind: "player"; playerId: string };

/**
 * Gère tous les salons du serveur.
 * Indépendant de Socket.IO : il reçoit des identifiants de socket et prévient par événements,
 * ce qui permet de le tester sans réseau.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private bindings = new Map<string, Binding>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly timings: RoomTimings,
    readonly events: RoomManagerEvents,
    private readonly getAvailableModes: () => GameModeId[],
  ) {}

  // ───────────── Lecture ─────────────

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  snapshot(code: string): RoomSnapshot | undefined {
    return this.rooms.get(code)?.snapshot(this.getAvailableModes());
  }

  /** Code du salon et joueur rattachés à une socket. */
  bindingOf(socketId: string): Binding | undefined {
    return this.bindings.get(socketId);
  }

  // ───────────── Écran commun ─────────────

  createSharedRoom(socketId: string): Room {
    this.detach(socketId);
    const room = this.createRoom("commun");
    room.screens.add(socketId);
    this.bindings.set(socketId, { code: room.code, kind: "screen" });
    return room;
  }

  watchRoom(socketId: string, rawCode: unknown): Room {
    const room = this.requireRoom(rawCode);
    this.detach(socketId);
    room.screens.add(socketId);
    this.bindings.set(socketId, { code: room.code, kind: "screen" });
    this.refreshIdle(room);
    this.events.changed(room.code);
    return room;
  }

  // ───────────── Joueurs ─────────────

  /**
   * Crée un salon « écran individuel » dont le créateur est le chef.
   * `who` : un pseudo d'invité, ou une identité de profil déjà vérifiée.
   */
  createIndividualRoom(socketId: string, who: unknown): Seat {
    const identity = this.toIdentity(who);
    this.detach(socketId);
    const room = this.createRoom("individuel");
    return this.seatHuman(room, socketId, identity);
  }

  join(socketId: string, rawCode: unknown, who: unknown): Seat {
    const identity = this.toIdentity(who);
    const room = this.requireRoom(rawCode);
    // Un profil déjà assis mais déconnecté reprend sa place, même pendant une partie.
    if (identity.profileId) {
      const existing = room.players.find((p) => p.profileId === identity.profileId);
      if (existing) {
        if (existing.connected) throw new RoomError(ERRORS.profileInRoom);
        return this.reattach(room, existing, socketId);
      }
    }
    if (room.phase !== "salon") throw new RoomError(ERRORS.roomStarted);
    if (room.isFull) {
      // Un humain prend la place du dernier bot ajouté.
      const lastBot = room.bots.at(-1);
      if (!lastBot) throw new RoomError(ERRORS.roomFull);
      this.removePlayer(room, lastBot);
    }
    this.detach(socketId);
    return this.seatHuman(room, socketId, identity);
  }

  resume(socketId: string, rawCode: unknown, rawToken: unknown): Seat {
    const room = this.requireRoom(rawCode);
    const player = typeof rawToken === "string" ? room.findByToken(rawToken) : undefined;
    if (!player || !player.token) throw new RoomError(ERRORS.sessionExpired);
    return this.reattach(room, player, socketId);
  }

  /** Rattache une socket à un joueur existant (reconnexion). */
  private reattach(room: Room, player: PlayerRecord, socketId: string): Seat {
    if (!player.token) throw new RoomError(ERRORS.sessionExpired);
    if (player.socketId && player.socketId !== socketId) {
      // Le joueur revient depuis un autre onglet ou appareil : l'ancien perd la main.
      const previous = player.socketId;
      this.bindings.delete(previous);
      this.events.detached(previous, "replaced");
    }
    this.detach(socketId);

    player.socketId = socketId;
    player.connected = true;
    this.bindings.set(socketId, { code: room.code, kind: "player", playerId: player.id });
    this.clearTimer(`seat:${room.code}:${player.id}`);
    if (player.isChef) this.clearTimer(`chef:${room.code}`);
    this.ensureChef(room);
    this.refreshIdle(room);
    this.events.changed(room.code);
    return { code: room.code, playerId: player.id, token: player.token };
  }

  /** Départ volontaire : la place est libérée immédiatement. */
  leave(socketId: string): void {
    const binding = this.bindings.get(socketId);
    if (!binding) return;
    const room = this.rooms.get(binding.code);
    this.bindings.delete(socketId);
    if (!room) return;

    if (binding.kind === "screen") {
      room.screens.delete(socketId);
    } else {
      const player = room.findPlayer(binding.playerId);
      if (player) this.removePlayer(room, player);
    }
    this.afterChange(room, { closeIfEmpty: true });
  }

  /** Coupure réseau : on garde la place un moment pour permettre la reconnexion. */
  disconnect(socketId: string): void {
    const binding = this.bindings.get(socketId);
    if (!binding) return;
    this.bindings.delete(socketId);
    const room = this.rooms.get(binding.code);
    if (!room) return;

    if (binding.kind === "screen") {
      room.screens.delete(socketId);
      this.afterChange(room);
      return;
    }

    const player = room.findPlayer(binding.playerId);
    if (!player || player.socketId !== socketId) return;
    player.connected = false;
    player.socketId = undefined;

    if (player.isChef) {
      this.setTimer(`chef:${room.code}`, this.timings.chefGrace, () => {
        this.ensureChef(room);
        this.events.changed(room.code);
      });
    }
    // Pendant une partie, la place est gardée : un bot joue à sa place en attendant.
    if (room.phase === "salon") this.holdSeat(room, player);
    this.afterChange(room);
  }

  setColor(socketId: string, color: unknown): void {
    const { room, player } = this.requirePlayer(socketId);
    if (typeof color !== "number" || !Number.isInteger(color) || color < 0 || color >= PLAYER_COLORS.length) {
      throw new RoomError(ERRORS.invalidColor);
    }
    if (!room.isColorFree(color, player.id)) throw new RoomError(ERRORS.colorTaken);
    player.color = color;
    this.events.changed(room.code);
  }

  // ───────────── Actions du chef ─────────────

  addBot(socketId: string, personality: unknown): void {
    const { room } = this.requireChef(socketId);
    if (room.phase !== "salon") throw new RoomError(ERRORS.roomStarted);
    if (!isBotPersonality(personality)) throw new RoomError(ERRORS.invalidBot);
    if (room.isFull) throw new RoomError(ERRORS.roomFull);
    room.players.push({
      id: newPlayerId(),
      name: room.botName(BOT_PERSONALITIES[personality].names, personality),
      avatar: randomAvatar(Math.random),
      profileId: null,
      color: room.firstFreeColor(),
      isChef: false,
      isBot: true,
      botPersonality: personality,
      connected: true,
    });
    this.events.changed(room.code);
  }

  removeBot(socketId: string, playerId: unknown): void {
    const { room } = this.requireChef(socketId);
    const target = typeof playerId === "string" ? room.findPlayer(playerId) : undefined;
    if (!target) throw new RoomError(ERRORS.playerNotFound);
    if (!target.isBot) throw new RoomError(ERRORS.notABot);
    if (room.phase !== "salon") throw new RoomError(ERRORS.roomStarted);
    this.removePlayer(room, target);
    this.events.changed(room.code);
  }

  kick(socketId: string, playerId: unknown): void {
    const { room, player: chef } = this.requireChef(socketId);
    const target = typeof playerId === "string" ? room.findPlayer(playerId) : undefined;
    if (!target) throw new RoomError(ERRORS.playerNotFound);
    if (target.id === chef.id) throw new RoomError(ERRORS.cannotKickSelf);
    const targetSocket = target.socketId;
    this.removePlayer(room, target);
    if (targetSocket) {
      this.bindings.delete(targetSocket);
      this.events.detached(targetSocket, "kicked");
    }
    this.events.changed(room.code);
  }

  updateSettings(socketId: string, patch: unknown): void {
    const { room } = this.requireChef(socketId);
    if (room.phase !== "salon") throw new RoomError(ERRORS.roomStarted);
    room.settings = applySettingsPatch(room.settings, patch);
    this.events.changed(room.code);
  }

  /** Vérifie que la partie peut démarrer. */
  checkCanStart(socketId: string): Room {
    const { room } = this.requireChef(socketId);
    if (room.phase !== "salon") throw new RoomError(ERRORS.roomStarted);
    if (room.players.length < MIN_PLAYERS_TO_START) throw new RoomError(ERRORS.notEnoughPlayers);
    if (!this.getAvailableModes().includes(room.settings.mode)) throw new RoomError(ERRORS.modeUnavailable);
    return room;
  }

  /** Lance la partie : `create` fabrique la session du mode choisi. */
  startGame(socketId: string, create: (room: Room) => GameSession): Room {
    const room = this.checkCanStart(socketId);
    room.phase = "partie";
    room.game = create(room);
    this.events.changed(room.code);
    room.game.start();
    return room;
  }

  /** Le chef arrête la partie (ou sort du podium) : retour au salon avec les mêmes joueurs. */
  backToLobby(socketId: string): void {
    const { room } = this.requireChef(socketId);
    if (room.phase !== "partie") throw new RoomError(ERRORS.noGame);
    room.game?.dispose();
    room.game = null;
    room.phase = "salon";
    for (const p of room.humans) if (!p.connected) this.holdSeat(room, p);
    this.events.changed(room.code);
  }

  gameReady(socketId: string): void {
    const { room, player } = this.requirePlayer(socketId);
    if (!room.game) throw new RoomError(ERRORS.noGame);
    room.game.ready(player.id);
  }

  /** Action sur le plateau (lancer le dé, choisir un chemin). */
  gameAction(socketId: string, action: unknown): void {
    const { room, player } = this.requirePlayer(socketId);
    if (!room.game) throw new RoomError(ERRORS.noGame);
    room.game.action(player.id, action);
  }

  /** Action de jeu : silencieuse (pas d'accusé), ignorée si elle n'a pas de sens. */
  gameInput(socketId: string, round: unknown, input: unknown): void {
    const binding = this.bindings.get(socketId);
    if (!binding || binding.kind !== "player" || typeof round !== "number") return;
    this.rooms.get(binding.code)?.game?.input(binding.playerId, round, input);
  }

  // ───────────── Profils ─────────────

  /** Un profil a changé : son nom et son avatar sont mis à jour dans les salons où il joue. */
  applyProfile(profile: PublicProfile): void {
    for (const room of this.rooms.values()) {
      let changed = false;
      for (const p of room.players) {
        if (p.profileId !== profile.id) continue;
        p.avatar = profile.avatar;
        if (p.name !== profile.name) p.name = room.uniqueName(profile.name, p.id);
        changed = true;
      }
      if (changed) this.events.changed(room.code);
    }
  }

  /** Un profil a été supprimé : ses joueurs en cours deviennent des invités. */
  forgetProfile(profileId: string): void {
    for (const room of this.rooms.values()) {
      for (const p of room.players) if (p.profileId === profileId) p.profileId = null;
    }
  }

  /** Arrête tous les minuteurs et parties (fin du serveur ou des tests). */
  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const room of this.rooms.values()) room.game?.dispose();
  }

  // ───────────── Interne ─────────────

  private createRoom(displayMode: DisplayMode): Room {
    const code = newRoomCode((c) => this.rooms.has(c));
    const room = new Room(code, displayMode);
    this.rooms.set(code, room);
    return room;
  }

  private seatHuman(room: Room, socketId: string, identity: Identity): Seat {
    const player: PlayerRecord = {
      id: newPlayerId(),
      name: room.uniqueName(identity.name),
      avatar: identity.avatar,
      profileId: identity.profileId,
      color: room.firstFreeColor(),
      isChef: false,
      isBot: false,
      connected: true,
      token: newToken(),
      socketId,
    };
    room.players.push(player);
    this.bindings.set(socketId, { code: room.code, kind: "player", playerId: player.id });
    this.ensureChef(room);
    this.refreshIdle(room);
    this.events.changed(room.code);
    return { code: room.code, playerId: player.id, token: player.token! };
  }

  /** Garde la place d'un joueur déconnecté pendant un moment, puis la libère. */
  private holdSeat(room: Room, player: PlayerRecord): void {
    this.setTimer(`seat:${room.code}:${player.id}`, this.timings.lobbySeatHold, () => {
      const still = room.findPlayer(player.id);
      if (still && !still.connected && room.phase === "salon") {
        this.removePlayer(room, still);
        this.afterChange(room);
      }
    });
  }

  private removePlayer(room: Room, player: PlayerRecord): void {
    room.players = room.players.filter((p) => p.id !== player.id);
    room.game?.playerRemoved(player.id);
    this.clearTimer(`seat:${room.code}:${player.id}`);
    if (player.isChef) {
      player.isChef = false;
      this.clearTimer(`chef:${room.code}`);
    }
  }

  /**
   * Garantit qu'un humain connecté tient le rôle de chef.
   * Le chef garde son rôle tant qu'il est connecté ; sinon le rôle passe au premier humain connecté.
   */
  private ensureChef(room: Room): void {
    const chef = room.chef;
    // Le chef garde sa place s'il est connecté ou s'il a encore un délai de grâce pour revenir.
    if (chef && (chef.connected || this.timers.has(`chef:${room.code}`))) return;
    const successor = room.humans.find((p) => p.connected);
    if (!successor) return;
    if (chef) chef.isChef = false;
    successor.isChef = true;
    this.clearTimer(`chef:${room.code}`);
  }

  private afterChange(room: Room, opts: { closeIfEmpty?: boolean } = {}): void {
    if (!this.rooms.has(room.code)) return;
    this.ensureChef(room);
    this.refreshIdle(room, opts.closeIfEmpty);
    if (this.rooms.has(room.code)) this.events.changed(room.code);
  }

  /**
   * Programme ou annule la fermeture d'un salon sans public.
   * `closeIfEmpty` : après un départ volontaire, un salon sans aucun humain ni écran ferme tout de suite.
   */
  private refreshIdle(room: Room, closeIfEmpty = false): void {
    const key = `idle:${room.code}`;
    if (room.hasAudience) {
      this.clearTimer(key);
      return;
    }
    if (closeIfEmpty && room.humans.length === 0 && room.screens.size === 0) {
      this.closeRoom(room, "Le salon est vide.");
      return;
    }
    if (!this.timers.has(key)) {
      this.setTimer(key, this.timings.roomIdle, () => this.closeRoom(room, "Le salon a été fermé faute de joueurs."));
    }
  }

  private closeRoom(room: Room, reason: string): void {
    if (!this.rooms.delete(room.code)) return;
    room.game?.dispose();
    room.game = null;
    for (const key of [...this.timers.keys()]) {
      if (key.includes(`:${room.code}`)) this.clearTimer(key);
    }
    const sockets: string[] = [];
    for (const [socketId, b] of this.bindings) {
      if (b.code === room.code) {
        sockets.push(socketId);
        this.bindings.delete(socketId);
      }
    }
    this.events.closed(room.code, reason, sockets);
  }

  private requireRoom(rawCode: unknown): Room {
    const code = normalizeRoomCode(rawCode);
    const room = isValidRoomCode(code) ? this.rooms.get(code) : undefined;
    if (!room) throw new RoomError(ERRORS.roomNotFound);
    return room;
  }

  private requireName(rawName: unknown): string {
    const name = sanitizeName(rawName);
    if (!name) throw new RoomError(ERRORS.nameRequired);
    return name;
  }

  /** Un pseudo (invité) ou une identité de profil vérifiée par la couche réseau. */
  private toIdentity(who: unknown): Identity {
    if (who && typeof who === "object" && "profileId" in who) {
      const w = who as Identity;
      return { name: this.requireName(w.name), avatar: normalizeAvatar(w.avatar), profileId: typeof w.profileId === "string" ? w.profileId : null };
    }
    const name = this.requireName(who);
    return { name, avatar: guestAvatar(name), profileId: null };
  }

  private requirePlayer(socketId: string): { room: Room; player: PlayerRecord } {
    const binding = this.bindings.get(socketId);
    if (!binding || binding.kind !== "player") throw new RoomError(ERRORS.notInRoom);
    const room = this.rooms.get(binding.code);
    const player = room?.findPlayer(binding.playerId);
    if (!room || !player) throw new RoomError(ERRORS.notInRoom);
    return { room, player };
  }

  private requireChef(socketId: string): { room: Room; player: PlayerRecord } {
    const found = this.requirePlayer(socketId);
    if (!found.player.isChef) throw new RoomError(ERRORS.notChef);
    return found;
  }

  /** Retire une socket de son salon actuel avant de la rattacher ailleurs. */
  private detach(socketId: string): void {
    if (this.bindings.has(socketId)) this.leave(socketId);
  }

  private setTimer(key: string, ms: number, fn: () => void): void {
    this.clearTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        fn();
      }, ms),
    );
  }

  private clearTimer(key: string): void {
    const t = this.timers.get(key);
    if (t) {
      clearTimeout(t);
      this.timers.delete(key);
    }
  }
}
