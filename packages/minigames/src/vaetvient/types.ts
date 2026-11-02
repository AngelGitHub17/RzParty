/** Données échangées par le mini-jeu « Va-et-vient ». */

export const VV_ROUNDS = 3;
export const VV_INTRO_MS = 2500;
export const VV_ANSWER_MS = 9000;
export const VV_REVEAL_MS = 3000;

export interface VVMove {
  id: number;
  dir: "in" | "out";
  count: number;
}

export interface VVState {
  round: number;
  phase: "intro" | "moves" | "answer" | "reveal" | "done";
  phaseEndsAt: number;
  /** Personnes dans la maison au départ (affiché pendant l'intro). */
  start: number;
  /** Dernier mouvement (pour l'animation). */
  move: VVMove | null;
  /** Bonne réponse, révélée à la fin de la manche. */
  inside: number | null;
  answered: string[];
  answers: Record<string, number> | null;
  scores: Record<string, number>;
}

export interface VVInput {
  round: number;
  answer: number;
}
