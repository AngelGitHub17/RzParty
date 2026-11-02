import type { BoardPrivate, Difficulty, GameSnapshot } from "@rzparty/shared";
import type { Room } from "../rooms/Room.ts";

/** Une partie en cours dans un salon (quel que soit le mode). */
export interface GameSession {
  start(): void;
  snapshot(): GameSnapshot;
  /** Le joueur a lu les règles. */
  ready(playerId: string): void;
  /** Action hors mini-jeu (plateau : lancer le dé, choisir un chemin). Peut lever une RoomError. */
  action(playerId: string, action: unknown): void;
  /** Action d'un joueur dans le mini-jeu de la manche `round`. */
  input(playerId: string, round: number, input: unknown): void;
  /** Renvoie l'état du mini-jeu en cours pour une socket qui (re)arrive. `playerId` null = écran commun. */
  replay(playerId: string | null): { round: number; state?: unknown; private?: unknown } | null;
  /** Informations secrètes d'un joueur hors mini-jeu (plateau : ses objets), pour une socket qui (re)arrive. */
  boardPrivate?(playerId: string): BoardPrivate | null;
  /** Un joueur a quitté définitivement le salon pendant la partie. */
  playerRemoved(playerId: string): void;
  /** Arrête tous les minuteurs. */
  dispose(): void;
}

/** Ce que le salon met à disposition d'une partie pour communiquer avec les joueurs. */
export interface GameHost {
  room: Room;
  /** L'état de la partie a changé : rediffuser l'instantané du salon. */
  changed(): void;
  publishMiniGame(round: number, state: unknown): void;
  sendPrivate(playerId: string, round: number, data: unknown): void;
  /** Plateau : informations secrètes d'un joueur (ses objets). Facultatif dans les tests. */
  sendBoardPrivate?(playerId: string, data: BoardPrivate): void;
  /** Fin d'une manche : pour les statistiques des profils. */
  roundEnded?(info: RoundStats): void;
  /** Fin de la partie (podium) : pour les statistiques des profils. */
  gameEnded?(info: { players: string[]; winners: string[] }): void;
  /** Hasard de la partie (graine fixe dans les tests). */
  random(): number;
  now(): number;
}

export interface GameModeModule {
  id: GameSnapshot["mode"];
  create(host: GameHost): GameSession;
}

export interface BotSetup {
  difficulty: Difficulty;
}

/** Ce qu'une manche apporte aux statistiques des joueurs. */
export interface RoundStats {
  miniGameId: string;
  /** Joueurs qui ont joué eux-mêmes (pas les bots ni les absents remplacés). */
  players: string[];
  winners: string[];
  records: Record<string, Record<string, number>>;
}
