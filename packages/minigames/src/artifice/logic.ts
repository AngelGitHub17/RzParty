/** « Feu d'artifice » : faire éclater la fusée au sommet de sa course. */
export interface ArtificeParams {
  /** Instant où la fusée atteint son sommet (ms). */
  peak: number;
  /** Hauteur du sommet, de 0,6 à 1 (part de la hauteur du ciel). */
  height: number;
  /** Couleur de l'éclat (indice dans ARTIFICE_COLORS). */
  color: number;
}

export const ARTIFICE_COLORS = [0xff5fa2, 0x3dd6ff, 0xffc83d, 0x7dff8a, 0xb388ff, 0xff8a3d] as const;

/** Hauteur de la fusée (0 = sol, 1 = haut du ciel) à l'instant t : une parabole qui culmine à `peak`. */
export function rocketHeight(t: number, p: ArtificeParams): number {
  const u = t / p.peak;
  return Math.max(0, p.height * (1 - (1 - u) * (1 - u)));
}

/** Instant où la fusée retombe au sol. */
export function landingAt(p: ArtificeParams): number {
  return p.peak * 2;
}

/** Score : 100 pile au sommet, de moins en moins en s'en éloignant ; 0 au sol (pétard mouillé). */
export function artificeScore(t: number | null, p: ArtificeParams): number {
  if (t === null || t >= landingAt(p)) return 0;
  const gap = Math.abs(t - p.peak) / p.peak;
  return Math.max(5, Math.round(100 - gap * 160));
}
