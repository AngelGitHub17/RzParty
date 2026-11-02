/** Données échangées par le mini-jeu « Coup d'œil ». */

export const EYE_ROUNDS = 4;
export const EYE_SHOW_MS = 3500;
export const EYE_ANSWER_MS = 8000;
export const EYE_REVEAL_MS = 2800;

export const SHAPES = ["etoile", "rond", "triangle", "carre"] as const;
export type ShapeKind = (typeof SHAPES)[number];
export const SHAPE_LABELS: Record<ShapeKind, { name: string; symbol: string }> = {
  etoile: { name: "étoiles", symbol: "★" },
  rond: { name: "ronds", symbol: "●" },
  triangle: { name: "triangles", symbol: "▲" },
  carre: { name: "carrés", symbol: "■" },
};

export interface Shape {
  kind: ShapeKind;
  /** Position en pourcentage du cadre. */
  x: number;
  y: number;
  color: number;
  size: number;
}

export interface EyeState {
  round: number;
  phase: "show" | "answer" | "reveal" | "done";
  phaseEndsAt: number;
  /** Les formes, uniquement pendant la phase « show ». */
  shapes: Shape[] | null;
  ask: ShapeKind;
  /** Bonne réponse, révélée à la phase « reveal ». */
  count: number | null;
  /** Joueurs qui ont répondu à cette manche (la valeur n'est révélée qu'à la fin de la manche). */
  answered: string[];
  answers: Record<string, number> | null;
  scores: Record<string, number>;
}

export interface EyeInput {
  round: number;
  answer: number;
}

export function pointsFor(answer: number | undefined, count: number): number {
  if (answer === undefined) return 0;
  const gap = Math.abs(answer - count);
  return gap === 0 ? 3 : gap === 1 ? 1 : 0;
}
