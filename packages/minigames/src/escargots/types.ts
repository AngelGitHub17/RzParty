/** Données échangées par le mini-jeu « Course d'escargots ». */

/** Appuis nécessaires pour arriver à la salade. */
export const SNAIL_GOAL = 70;
/** Au-delà de ce nombre d'appuis sur la dernière seconde, l'escargot s'essouffle… */
export const SNAIL_MAX_RATE = 8;
/** … pendant ce temps (ms). */
export const SNAIL_TIRED_MS = 1300;
export const SNAIL_READY_MS = 2500;
export const SNAIL_MAX_MS = 26_000;
export const SNAIL_RESULT_MS = 3000;

export interface EscargotsState {
  phase: "ready" | "run" | "result" | "done";
  startedAt: number;
  phaseEndsAt: number;
  /** Appuis comptés par joueur (0 → SNAIL_GOAL). */
  progress: Record<string, number>;
  /** Essoufflé jusqu'à (temps serveur), par joueur. */
  tiredUntil: Record<string, number>;
  /** Temps d'arrivée (ms depuis le départ), par joueur arrivé. */
  finished: Record<string, number>;
}

export interface EscargotsInput {
  /** Nombre d'appuis depuis le dernier envoi (1 à 6). */
  taps: number;
}
