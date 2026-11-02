import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  defaultSettings,
  type BotPersonality,
  type DisplayMode,
  type GameModeId,
  type PublicPlayer,
  type RoomPhase,
  type RoomSettings,
  type RoomSnapshot,
} from "@rzparty/shared";
import type { GameSession } from "../game/types.ts";

/** Joueur côté serveur : la version publique + ce qui ne doit jamais sortir du serveur. */
export interface PlayerRecord extends PublicPlayer {
  /** Jeton de reconnexion (humains uniquement). */
  token?: string;
  /** Socket actuellement associée à ce joueur, s'il est connecté. */
  socketId?: string;
}

/** État d'un salon. Ne contient aucune logique réseau : tout passe par le RoomManager. */
export class Room {
  readonly code: string;
  readonly displayMode: DisplayMode;
  phase: RoomPhase = "salon";
  settings: RoomSettings = defaultSettings();
  /** Dans l'ordre d'arrivée : c'est aussi l'ordre de succession du chef. */
  players: PlayerRecord[] = [];
  /** Sockets des écrans communs qui affichent ce salon. */
  screens = new Set<string>();
  /** Partie en cours (phase « partie » uniquement). */
  game: GameSession | null = null;

  constructor(code: string, displayMode: DisplayMode) {
    this.code = code;
    this.displayMode = displayMode;
  }

  get chef(): PlayerRecord | undefined {
    return this.players.find((p) => p.isChef);
  }

  get humans(): PlayerRecord[] {
    return this.players.filter((p) => !p.isBot);
  }

  get bots(): PlayerRecord[] {
    return this.players.filter((p) => p.isBot);
  }

  get isFull(): boolean {
    return this.players.length >= MAX_PLAYERS;
  }

  /** Vrai si au moins un humain ou un écran est connecté. */
  get hasAudience(): boolean {
    return this.screens.size > 0 || this.humans.some((p) => p.connected);
  }

  findPlayer(id: string): PlayerRecord | undefined {
    return this.players.find((p) => p.id === id);
  }

  findByToken(token: string): PlayerRecord | undefined {
    return this.players.find((p) => p.token !== undefined && p.token === token);
  }

  isColorFree(color: number, exceptPlayerId?: string): boolean {
    return !this.players.some((p) => p.color === color && p.id !== exceptPlayerId);
  }

  firstFreeColor(): number {
    const index = PLAYER_COLORS.findIndex((_, i) => this.isColorFree(i));
    return index === -1 ? 0 : index;
  }

  /** Rend le pseudo unique dans le salon en ajoutant un numéro si besoin (« Léa », « Léa 2 »…). */
  uniqueName(base: string, exceptPlayerId?: string): string {
    const taken = new Set(this.players.filter((p) => p.id !== exceptPlayerId).map((p) => p.name.toLocaleLowerCase("fr")));
    if (!taken.has(base.toLocaleLowerCase("fr"))) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!taken.has(candidate.toLocaleLowerCase("fr"))) return candidate;
    }
  }

  /** Choisit un nom de bot libre dans la liste de sa personnalité. */
  botName(names: readonly string[], personality: BotPersonality): string {
    const used = new Set(this.players.map((p) => p.name));
    const free = names.find((n) => !used.has(n));
    return free ?? this.uniqueName(names[0] ?? personality);
  }

  snapshot(availableModes: GameModeId[]): RoomSnapshot {
    return {
      code: this.code,
      displayMode: this.displayMode,
      phase: this.phase,
      settings: structuredClone(this.settings),
      screenConnected: this.screens.size > 0,
      availableModes,
      game: this.game?.snapshot() ?? null,
      serverNow: Date.now(),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        avatar: { ...p.avatar },
        profileId: p.profileId,
        isChef: p.isChef,
        isBot: p.isBot,
        botPersonality: p.botPersonality,
        connected: p.connected,
      })),
    };
  }
}
