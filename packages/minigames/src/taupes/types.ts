/** Données échangées par le mini-jeu « Tape-taupe ». */

export const TAUPES_DURATION_MS = 30_000;
export const HOLES = 9;
/** Marge accordée pour la latence du réseau après la disparition d'une taupe. */
export const LATENCY_MS = 250;

export interface Mole {
  id: number;
  hole: number;
  /** Taupe dorée : vaut 3 points. */
  golden: boolean;
  /** Disparition, en temps serveur. */
  until: number;
}

export interface TaupesState {
  endsAt: number;
  /** Taupes visibles en ce moment. */
  moles: Mole[];
  scores: Record<string, number>;
  /** Taupes déjà tapées, par joueur (identifiants). */
  hits: Record<string, number[]>;
  finished: boolean;
}

export interface TaupesInput {
  hole: number;
  /** Taupe visée (absente si le joueur a tapé un trou vide). */
  mole?: number;
}
