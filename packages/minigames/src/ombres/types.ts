/** Données échangées par le mini-jeu « Ombres chinoises ». */

/** Objets dont on projette l'ombre (des silhouettes bien reconnaissables). */
export const SHADOW_THINGS = ["🐘", "🦒", "🐇", "🐌", "🦀", "🐙", "🚲", "✈️", "🎸", "☂️", "🔑", "🍐", "⚓", "🦋", "🐢", "🐓", "🌵", "🦕", "🐈", "🍄", "🏰", "⛵", "🐿️", "🦢"] as const;

export const SHADOW_ROUNDS = 7;
export const SHADOW_ASK_MS = 7000;
export const SHADOW_REVEAL_MS = 2000;
export const SHADOW_POINTS = { first: 3, other: 1 };

export interface OmbresState {
  round: number;
  phase: "ask" | "reveal" | "done";
  phaseEndsAt: number;
  /** Ombre affichée (indice dans SHADOW_THINGS) ; rotation et miroir pour corser. */
  shadow: number | null;
  tilt: number;
  mirror: boolean;
  /** Les quatre propositions (indices dans SHADOW_THINGS). */
  choices: number[];
  /** Bonne réponse (révélée à la fin de la manche). */
  answer: number | null;
  correct: string[];
  wrong: string[];
  scores: Record<string, number>;
}

export interface OmbresInput {
  round: number;
  /** Indice choisi dans `choices`. */
  pick: number;
}
