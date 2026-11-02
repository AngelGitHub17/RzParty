/** Données échangées par le mini-jeu « Mémo-flash ». */

export const MEMO_MAX_LEVEL = 10;

/**
 * Chaque niveau change de variante :
 * - `couleurs`, `formes`, `chiffres` : retenir une suite et la reproduire dans l'ordre ;
 * - `disparu` : retenir une rangée d'objets, puis retrouver celui qui a disparu.
 */
export type MemoVariant = "couleurs" | "formes" | "chiffres" | "disparu";

export const VARIANT_ORDER: MemoVariant[] = ["couleurs", "formes", "disparu", "chiffres"];

export const COLORS = ["rouge", "bleu", "jaune", "vert", "orange", "violet"] as const;
export const SHAPES = ["rond", "carre", "triangle", "etoile", "coeur", "losange"] as const;
export const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Touches proposées pour une variante de suite. */
export function alphabet(variant: Exclude<MemoVariant, "disparu">): readonly string[] {
  return variant === "couleurs" ? COLORS : variant === "formes" ? SHAPES : DIGITS;
}

/** Variante et longueur du niveau `level` (à partir de 1). La longueur augmente tous les deux niveaux. */
export function levelSetup(level: number): { variant: MemoVariant; length: number } {
  const variant = VARIANT_ORDER[(level - 1) % VARIANT_ORDER.length]!;
  const length = 3 + Math.floor((level - 1) / 2) + (variant === "disparu" ? 1 : 0);
  return { variant, length };
}

export type MemoStatus = "en-jeu" | "envoye" | "elimine";

export interface MemoState {
  level: number;
  variant: MemoVariant;
  length: number;
  phase: "show" | "input" | "check" | "done";
  /** Ce qu'il faut retenir. Visible pendant « show » et « check » ; masqué pendant la saisie. */
  items: string[] | null;
  /** Variante « disparu » : la rangée avec un trou (null), visible pendant la saisie. */
  holed: (string | null)[] | null;
  /** Variante « disparu » : les objets proposés. */
  choices: string[] | null;
  /** Variante « disparu » : la bonne réponse, révélée au contrôle. */
  missing: string | null;
  phaseEndsAt: number;
  status: Record<string, MemoStatus>;
  lastCheck: Record<string, boolean>;
}

export interface MemoInput {
  items: string[];
}

export const showDuration = (length: number) => 1800 + 600 * length;
export const inputDuration = (length: number) => 7000 + 900 * length;
