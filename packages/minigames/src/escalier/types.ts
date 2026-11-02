/** Données échangées par le mini-jeu « Escalier secret ». */

export const STAIRS = 12;
export const STEP_CHOICE_MS = 7000;
export const STEP_REVEAL_MS = 2600;
export const MAX_STEP_ROUNDS = 14;

export interface EscalierState {
  round: number;
  phase: "choose" | "reveal" | "done";
  phaseEndsAt: number;
  heights: Record<string, number>;
  /** Qui a déjà choisi (le choix reste secret jusqu'à la révélation). */
  chosen: string[];
  /** Choix révélés (phase « reveal ») et qui a été bloqué. */
  picks: Record<string, number> | null;
  blocked: string[];
}

export interface EscalierInput {
  round: number;
  steps: 1 | 2 | 3;
}
