import type { Avatar } from "@rzparty/shared";

/** Données échangées par le mini-jeu « Où est-il ? ». */

export const FACE_ROUNDS = 5;
export const FACE_SHOW_MS = 2500;
export const FACE_FIND_MS = 9000;
export const FACE_REVEAL_MS = 2200;
export const FACE_COUNT = 12;

export interface FaceState {
  round: number;
  phase: "show" | "find" | "reveal" | "done";
  phaseEndsAt: number;
  /** Le personnage à retrouver (pendant « show » et « reveal »). */
  target: Avatar | null;
  /** Les sosies (pendant « find » et « reveal »). */
  crowd: Avatar[] | null;
  /** Bonne case, révélée à la fin de la manche. */
  answer: number | null;
  /** Réponses de la manche : ordre des bonnes réponses et joueurs qui se sont trompés. */
  correct: string[];
  wrong: string[];
  scores: Record<string, number>;
}

export interface FaceInput {
  round: number;
  pick: number;
}
