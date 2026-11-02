/** Données échangées par le mini-jeu « Ruée vers l'Ouest ». */

export const BANDITS_DURATION_MS = 30_000;
export const WINDOWS = 8;
export const BANDIT_LATENCY_MS = 250;

export interface Popup {
  id: number;
  window: number;
  kind: "bandit" | "habitant";
  until: number;
}

export interface BanditsState {
  endsAt: number;
  popups: Popup[];
  scores: Record<string, number>;
  /** Silhouettes déjà touchées, par joueur. */
  hits: Record<string, number[]>;
  finished: boolean;
}

export interface BanditsInput {
  popup: number;
}
