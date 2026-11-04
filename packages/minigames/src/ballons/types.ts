/** Données échangées par le mini-jeu « Ballons volants ». */

export const BALLOONS_MS = 30_000;
/** Temps de montée d'un ballon, du bas au haut de l'écran. */
export const RISE_MS = 4200;
export const LATENCY_MS = 300;
export const COLOR_EVERY_MS = 6000;

export const BALLOON_COLORS = [
  { name: "rouges", hex: "#f0483e" },
  { name: "bleus", hex: "#3f7fe0" },
  { name: "verts", hex: "#2db866" },
  { name: "violets", hex: "#9b59d0" },
] as const;

export interface Balloon {
  id: number;
  /** Position horizontale, de 0 à 1. */
  x: number;
  /** Couleur (indice), ou -1 pour le ballon doré. */
  color: number;
  /** Départ, en temps serveur. */
  born: number;
}

export interface BallonsState {
  endsAt: number;
  /** Couleur à éclater, et depuis quand. */
  target: number;
  targetSince: number;
  balloons: Balloon[];
  scores: Record<string, number>;
  /** Ballons éclatés par chaque joueur. */
  popped: Record<string, number[]>;
  finished: boolean;
}

export interface BallonsInput {
  balloon: number;
}
