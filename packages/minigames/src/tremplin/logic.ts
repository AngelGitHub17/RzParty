/** « Grand tremplin » : sauter le plus tard possible… mais avant le bout du tremplin. */
export interface TremplinParams {
  /** Temps mis par le skieur pour atteindre le bout du tremplin. */
  ramp: number;
}

export function tremplinScore(t: number | null, p: TremplinParams): number {
  if (t === null || t > p.ramp) return 0;
  return Math.round(40 + 100 * Math.pow(t / p.ramp, 3));
}
