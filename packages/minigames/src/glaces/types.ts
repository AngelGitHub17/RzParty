/** Données échangées par le mini-jeu « Cornet glacé ». */

export const FLAVORS = [
  { id: "fraise", label: "Fraise", hex: "#FF8FB5" },
  { id: "chocolat", label: "Chocolat", hex: "#7A4A2A" },
  { id: "vanille", label: "Vanille", hex: "#FFF1C2" },
  { id: "pistache", label: "Pistache", hex: "#A8D86E" },
  { id: "myrtille", label: "Myrtille", hex: "#6F7BE8" },
  { id: "citron", label: "Citron", hex: "#FFE14D" },
] as const;

export const ICE_ROUNDS = 4;
/** Boules de la première commande (une de plus à chaque manche). */
export const ICE_FIRST = 3;
export const ICE_BUILD_MS = 10_000;
export const ICE_REVEAL_MS = 2600;
export const ICE_POINTS = [3, 2, 1];

/** Temps pour mémoriser une commande de `n` boules. */
export function iceShowMs(n: number): number {
  return 1200 + n * 600;
}

export interface GlacesState {
  round: number;
  phase: "show" | "build" | "reveal" | "done";
  phaseEndsAt: number;
  /** La commande (indices dans FLAVORS, de bas en haut) : visible pendant « show » et « reveal ». */
  order: number[] | null;
  /** Nombre de boules à mettre. */
  size: number;
  /** Bons cornets, dans l'ordre d'arrivée, et cornets ratés. */
  correct: string[];
  wrong: string[];
  scores: Record<string, number>;
}

export interface GlacesInput {
  round: number;
  scoops: number[];
}
