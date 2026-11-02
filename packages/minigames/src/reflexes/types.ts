/** Données échangées par le mini-jeu « Dégaine ! » (serveur et navigateur). */

export const REFLEX_ROUNDS = 3;
/** Pénalité d'un faux départ, en ms. */
export const REFLEX_FALSE_START_MS = 2000;
/** Pénalité si le joueur ne réagit pas, en ms. */
export const REFLEX_MISS_MS = 1500;
/** En dessous de ce temps, la réaction est jugée impossible pour un humain (anticipation). */
export const REFLEX_HUMAN_MIN_MS = 100;

export type ReflexOutcome = { kind: "time"; ms: number } | { kind: "false-start" } | { kind: "miss" };

export interface ReflexState {
  /** Manche en cours, de 1 à REFLEX_ROUNDS. */
  turn: number;
  phase: "wait" | "go" | "done";
  /** Identifiant du signal « GO » en cours (change à chaque manche). */
  signal: number;
  /** Résultat de chaque joueur pour chaque manche jouée. */
  outcomes: Record<string, (ReflexOutcome | null)[]>;
  /** Total cumulé (temps + pénalités), en ms. */
  totals: Record<string, number>;
}

export interface ReflexInput {
  kind: "tap";
  signal: number;
  /** Temps de réaction mesuré par le navigateur, en ms (absent pour un appui avant le signal). */
  reactionMs?: number;
}

export function outcomeCost(o: ReflexOutcome | null): number {
  if (!o || o.kind === "miss") return REFLEX_MISS_MS;
  if (o.kind === "false-start") return REFLEX_FALSE_START_MS;
  return o.ms;
}
