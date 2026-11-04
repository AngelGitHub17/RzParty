/** « Ressort » : une jauge qui oscille de plus en plus vite ; l'élan grandit à chaque rebond. */
export interface RessortParams {
  /** Fréquence de départ (rebonds par ms) et accélération. */
  f0: number;
  accel: number;
}

export const RESSORT_PEAKS = 7;
const ELAN = 0.12;

/** Nombre de rebonds (fractionnaire) effectués à l'instant t. */
export function cycles(t: number, p: RessortParams): number {
  return p.f0 * t + (p.accel * t * t) / 2;
}

/** Hauteur de la jauge (0 à 1) à l'instant t. */
export function spring(t: number, p: RessortParams): number {
  return (1 - Math.cos(2 * Math.PI * cycles(t, p))) / 2;
}

/** Multiplicateur d'élan : ×1 au premier sommet, puis +0,12 par rebond. */
export function elan(t: number, p: RessortParams): number {
  return 1 + ELAN * Math.max(0, Math.floor(cycles(t, p)));
}

/** Instant du k-ième sommet (k = 0 pour le premier). */
export function peakAt(k: number, p: RessortParams): number {
  const c = k + 0.5;
  return (-p.f0 + Math.sqrt(p.f0 * p.f0 + 2 * p.accel * c)) / p.accel;
}

export function ressortScore(t: number | null, p: RessortParams): number {
  if (t === null || t > peakAt(RESSORT_PEAKS - 1, p) + 250) return 0;
  return Math.round(100 * Math.pow(spring(t, p), 4) * elan(t, p));
}
