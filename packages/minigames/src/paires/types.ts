/** Données échangées par le mini-jeu « Paires de fruits ». */

export const PAIRS_DURATION_MS = 60_000;
export const PAIRS = 8;
export const FRUITS = ["🍎", "🍌", "🍇", "🍓", "🍒", "🍍", "🥝", "🍑", "🍋", "🥥"];
export const MISMATCH_MS = 800;

export interface PairsState {
  endsAt: number;
  found: Record<string, number>;
  finishers: string[];
  finished: boolean;
}

/** Le jeu du joueur : pour chaque carte, le fruit s'il est visible (retourné ou trouvé), sinon null. */
export interface PairsPrivate {
  cards: (string | null)[];
  found: boolean[];
  lockedUntil: number;
  moves: number;
}

export interface PairsInput {
  card: number;
}
