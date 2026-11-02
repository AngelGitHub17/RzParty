/** « Pas comptés » : continuer de compter les pas une fois l'écran masqué. */
export interface PasParams {
  /** Durée d'un pas. */
  pace: number;
  /** Nombre de pas à faire. */
  target: number;
  /** Nombre de pas affichés avant que tout devienne invisible. */
  visible: number;
}

export function pasScore(t: number | null, p: PasParams): number {
  if (t === null) return 0;
  const gap = Math.abs(t / p.pace - p.target);
  return Math.max(0, Math.round(100 - 40 * gap));
}
