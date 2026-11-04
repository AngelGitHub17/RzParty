/** Données échangées par le mini-jeu « Chasse aux perles ». */

export const PERLES_MS = 30_000;
export const OYSTERS = 6;
/** Dernier moment de l'ouverture : l'huître se referme et pince. */
export const CLOSING_MS = 260;
export const PINCH_MS = 1200;
export const LATENCY_MS = 220;

export type Treasure = "perle" | "doree" | "crabe";

export interface Opening {
  id: number;
  oyster: number;
  treasure: Treasure;
  /** Ouverture et fermeture, en temps serveur. */
  from: number;
  until: number;
}

export interface PerlesState {
  endsAt: number;
  openings: Opening[];
  scores: Record<string, number>;
  /** Ouvertures déjà fouillées par chaque joueur. */
  taken: Record<string, number[]>;
  /** Main pincée jusqu'à… (temps serveur). */
  pinched: Record<string, number>;
  finished: boolean;
}

export interface PerlesInput {
  opening: number;
  /** Temps écoulé depuis l'ouverture, mesuré sur l'appareil. */
  dt: number;
}
