/** « Chamboule-tout » : lancer quand le viseur passe au centre de la pyramide. */
export interface ChambouleParams {
  /** Durée d'un aller-retour du viseur (ms). */
  period: number;
  /** Position du centre de la pyramide, de -0,5 à 0,5 (le viseur va de -1 à 1). */
  center: number;
  /** Nombre d'allers-retours avant que la balle tombe toute seule. */
  sweeps: number;
}

export const CANS = 6;

/** Position du viseur (de -1 à 1) à l'instant t. */
export function aimAt(t: number, p: ChambouleParams): number {
  return Math.sin((2 * Math.PI * t) / p.period);
}

/** Boîtes renversées pour un lancer à l'instant t (0 sans lancer). */
export function cansDown(t: number | null, p: ChambouleParams): number {
  if (t === null || t > p.period * p.sweeps) return 0;
  const gap = Math.abs(aimAt(t, p) - p.center);
  return Math.max(0, Math.min(CANS, Math.round(CANS * (1 - gap / 0.55))));
}

/** Points : une par boîte, +4 si toutes tombent. */
export function chambouleScore(t: number | null, p: ChambouleParams): number {
  const n = cansDown(t, p);
  return n + (n === CANS ? 4 : 0);
}

/** Premier instant où le viseur passe au centre (pour les bots). */
export function firstCenter(p: ChambouleParams): number {
  const a = Math.asin(Math.max(-1, Math.min(1, p.center)));
  const t = (a / (2 * Math.PI)) * p.period;
  return t >= 0 ? t : t + p.period;
}
