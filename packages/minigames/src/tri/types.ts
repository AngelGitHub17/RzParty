/** Données échangées par le mini-jeu « Tri éclair ». */

export const TRI_DURATION_MS = 40_000;
export const TRI_SETS = 8;
export const TRI_PENALTY_MS = 600;

export interface TriState {
  endsAt: number;
  /** Séries terminées et progression dans la série en cours. */
  progress: Record<string, { sets: number; step: number }>;
  /** Ordre d'arrivée des joueurs qui ont fini les 8 séries. */
  finishers: string[];
  finished: boolean;
}

export interface TriPrivate {
  set: number;
  numbers: number[];
  /** Nombres déjà touchés dans cette série. */
  done: number[];
  lockedUntil: number;
  last: "faux" | null;
}

export interface TriInput {
  set: number;
  value: number;
}

/** Série n°i : de plus en plus de nombres, de plus en plus proches. */
export function makeSet(random: () => number, i: number): number[] {
  const count = Math.min(8, 4 + Math.floor(i / 2));
  const max = i < 3 ? 30 : i < 6 ? 99 : 199;
  const set = new Set<number>();
  while (set.size < count) set.add(1 + Math.floor(random() * max));
  return [...set];
}
