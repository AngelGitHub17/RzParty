/**
 * Contrat d'un mini-jeu RzParty.
 *
 * Un mini-jeu ne connaît ni le plateau, ni les pièces, ni les vies : il reçoit des joueurs,
 * les fait jouer, puis rend un CLASSEMENT. C'est le mode de jeu (Survie, Plateau…) qui
 * transforme ce classement en pièces, en points ou en vies perdues.
 *
 * Chaque mini-jeu vit dans son propre dossier `src/<id>/` :
 *   - `definition.ts` : la fiche (nom, catégorie, formats, durée, règles) ;
 *   - `server.ts`     : la logique autoritaire et le bot, exécutés uniquement sur le serveur ;
 *   - `view.ts`       : l'affichage navigateur (écran commun, manette, écran individuel).
 */
import type { BotPersonality, Difficulty, MiniGameInfo } from "@rzparty/shared";

export type MiniGameCategory = "reflexes" | "memoire" | "frappe" | "calcul" | "logique" | "labyrinthe" | "chaines" | "bombe";

/** `chacun` = chacun pour soi ; les autres formats opposent des équipes. */
export type MiniGameFormat = "chacun" | "1v1" | "2v2" | "4v4";

export interface MiniGameDefinition extends MiniGameInfo {
  category: MiniGameCategory;
  formats: MiniGameFormat[];
  players: { min: number; max: number };
  /** Durée maximale d'une manche, en secondes (filet de sécurité du moteur). */
  durationSec: number;
  /** Records gardés dans les profils (ex. meilleur temps de réaction). */
  records?: MiniGameRecord[];
}

export interface MiniGameRecord {
  key: string;
  label: string;
  /** « lower » : plus petit = meilleur (un temps) ; « higher » : plus grand = meilleur (un score). */
  better: "lower" | "higher";
  unit?: string;
}

/** Résultats chiffrés d'une manche, par joueur : { idJoueur: { cléRecord: valeur } }. */
export type MiniGameRecords = Record<string, Record<string, number>>;

/** Joueur tel qu'un mini-jeu le voit. */
export interface MiniGamePlayer {
  id: string;
  name: string;
  color: number;
  team?: number;
}

/**
 * Classement final : des groupes d'identifiants, du meilleur au moins bon.
 * Plusieurs identifiants dans un même groupe = égalité.
 */
export type MiniGameRanking = string[][];

/** Outils fournis par le moteur à la logique serveur d'un mini-jeu. */
export interface MiniGameServerContext<State, Private> {
  players: MiniGamePlayer[];
  format: MiniGameFormat;
  /** Hasard reproductible (même graine = même manche), utile pour les tests. */
  random(): number;
  /** Heure du serveur en millisecondes. */
  now(): number;
  /** Publie l'état visible par tous (écran commun, manettes, écrans individuels). */
  publish(state: State): void;
  /** Envoie une information privée à un seul joueur (ex. : sa question en cours). */
  sendTo(playerId: string, data: Private): void;
  /** Programme un rappel ; tous les rappels sont annulés à la fin de la manche. */
  schedule(delayMs: number, fn: () => void): void;
  /**
   * Termine la manche avec son classement, et éventuellement les valeurs des records déclarés
   * dans la fiche. Les appels suivants sont ignorés.
   */
  finish(ranking: MiniGameRanking, records?: MiniGameRecords): void;
}

export interface MiniGameServerLogic {
  start(): void;
  /**
   * Action d'un joueur (humain ou bot). L'entrée vient du réseau : elle doit être vérifiée,
   * et ignorée si elle est invalide.
   */
  input(playerId: string, input: unknown): void;
}

/** Ce qu'un bot sait de lui-même. */
export interface BotProfile {
  personality: BotPersonality;
  difficulty: Difficulty;
}

export interface MiniGameBotContext<Input> {
  player: MiniGamePlayer;
  profile: BotProfile;
  random(): number;
  now(): number;
  /** Envoie une action, exactement comme un joueur humain. */
  send(input: Input): void;
  schedule(delayMs: number, fn: () => void): void;
}

export interface MiniGameBot<State, Private> {
  onState(state: State): void;
  onPrivate?(data: Private): void;
}

export interface MiniGameServerModule<State = unknown, Private = unknown, Input = unknown> {
  definition: MiniGameDefinition;
  create(ctx: MiniGameServerContext<State, Private>): MiniGameServerLogic;
  /** Fait jouer un bot (ou remplace un joueur déconnecté). */
  bot(ctx: MiniGameBotContext<Input>): MiniGameBot<State, Private>;
}

export function defineMiniGame<State, Private, Input>(
  module: MiniGameServerModule<State, Private, Input>,
): MiniGameServerModule<State, Private, Input> {
  return module;
}

/**
 * Transforme des scores en classement (groupes d'égalité).
 * `better(a, b)` < 0 si a est meilleur que b, 0 en cas d'égalité.
 */
export function rankBy<T>(items: T[], idOf: (item: T) => string, better: (a: T, b: T) => number): MiniGameRanking {
  const sorted = [...items].sort(better);
  const groups: MiniGameRanking = [];
  let previous: T | undefined;
  for (const item of sorted) {
    if (previous !== undefined && better(previous, item) === 0) groups.at(-1)!.push(idOf(item));
    else groups.push([idOf(item)]);
    previous = item;
  }
  return groups;
}

/** Réglages des bots selon la difficulté : multiplicateurs appliqués par chaque mini-jeu. */
export const BOT_SKILL: Record<Difficulty, { speed: number; accuracy: number }> = {
  facile: { speed: 0.7, accuracy: 0.75 },
  moyen: { speed: 1, accuracy: 0.88 },
  difficile: { speed: 1.35, accuracy: 0.96 },
};

/**
 * Traits des personnalités : `speed` accélère, `accuracy` réduit les erreurs,
 * `chaos` ajoute de l'imprévu (temps et erreurs très variables).
 */
export const BOT_TRAITS: Record<BotPersonality, { speed: number; accuracy: number; chaos: number }> = {
  equilibre: { speed: 1, accuracy: 1, chaos: 0.1 },
  agressif: { speed: 1.25, accuracy: 0.85, chaos: 0.2 },
  "lent-precis": { speed: 0.75, accuracy: 1.12, chaos: 0.05 },
  glitch: { speed: 1, accuracy: 0.9, chaos: 0.6 },
};

/** Combine difficulté et personnalité. `accuracy` est plafonnée à 0,99. */
export function botSkill(profile: BotProfile): { speed: number; accuracy: number; chaos: number } {
  const d = BOT_SKILL[profile.difficulty];
  const t = BOT_TRAITS[profile.personality];
  return { speed: d.speed * t.speed, accuracy: Math.min(0.99, d.accuracy * t.accuracy), chaos: t.chaos };
}
