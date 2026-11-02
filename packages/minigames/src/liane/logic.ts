/** « Liane folle » : lâcher la liane quand elle part vers l'avant, à mi-hauteur. */
export interface LianeParams {
  /** Durée d'un aller-retour de la liane. */
  period: number;
}

/** Angle de la liane (en radians, positif vers l'avant) et sens du mouvement. */
export function swing(t: number, p: LianeParams): { angle: number; forward: boolean; phase: number } {
  const phase = ((t / p.period) * Math.PI * 2) % (Math.PI * 2);
  return { angle: 0.95 * Math.sin(phase), forward: Math.cos(phase) > 0, phase };
}

export function lianeScore(t: number | null, p: LianeParams): number {
  if (t === null) return 0;
  const { phase } = swing(t, p);
  // Devant et en montée : la distance est maximale au milieu (phase π/4).
  if (phase < Math.PI / 2) return Math.round(15 + 85 * Math.sin(2 * phase));
  if (phase < Math.PI) return Math.round(12 * Math.sin(phase));
  return 0;
}
