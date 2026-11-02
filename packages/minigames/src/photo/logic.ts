/** « Photo souvenir » : déclencher au moment du plus beau sourire. */
export interface PhotoParams {
  /** Grand sourire (100 %) : instant et largeur. */
  peakAt: number;
  width: number;
  /** Faux sourires, moins grands. */
  fakes: { at: number; height: number }[];
  /** Fin de la séance photo. */
  length: number;
}

/** Sourire (0 à 100) à l'instant t. */
export function smile(t: number, p: PhotoParams): number {
  const bump = (at: number, height: number, width: number) => height * Math.exp(-Math.pow((t - at) / width, 2));
  let v = 8 + 4 * Math.sin(t / 170);
  v = Math.max(v, bump(p.peakAt, 100, p.width));
  for (const f of p.fakes) v = Math.max(v, bump(f.at, f.height, p.width * 1.4));
  return Math.max(0, Math.min(100, v));
}

export function photoScore(t: number | null, p: PhotoParams): number {
  return t === null ? 0 : Math.round(smile(t, p));
}
