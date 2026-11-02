/** Données échangées par le mini-jeu « Couleurs piégées ». */

export const STROOP_DURATION_MS = 35_000;
export const STROOP_PENALTY_MS = 1000;

export const STROOP_COLORS = [
  { id: "rouge", label: "ROUGE", hex: "#F0483E" },
  { id: "bleu", label: "BLEU", hex: "#2F7BEF" },
  { id: "vert", label: "VERT", hex: "#2DB866" },
  { id: "jaune", label: "JAUNE", hex: "#F2B705" },
  { id: "violet", label: "VIOLET", hex: "#9257E8" },
] as const;
export type StroopColor = (typeof STROOP_COLORS)[number]["id"];

export interface StroopQuestion {
  /** Le mot écrit. */
  word: StroopColor;
  /** La couleur de l'encre (la bonne réponse). */
  ink: StroopColor;
  /** Les boutons proposés, dans cet ordre. */
  choices: StroopColor[];
}

export interface StroopState {
  endsAt: number;
  progress: Record<string, { score: number; errors: number }>;
  finished: boolean;
}

export interface StroopPrivate {
  index: number;
  question: StroopQuestion;
  /** Bloqué jusqu'à (temps serveur) après une erreur. */
  lockedUntil: number;
  last: "juste" | "faux" | null;
}

export interface StroopInput {
  index: number;
  answer: StroopColor;
}

/** Question n°i : l'encre n'est jamais la couleur du mot ; 4 boutons, dont la bonne réponse et le mot (le piège). */
export function makeStroop(random: () => number): StroopQuestion {
  const ids = STROOP_COLORS.map((c) => c.id) as StroopColor[];
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)]!;
  const word = pick(ids);
  const ink = pick(ids.filter((c) => c !== word));
  const others = ids.filter((c) => c !== word && c !== ink).sort(() => random() - 0.5).slice(0, 2);
  const choices = [word, ink, ...others].sort(() => random() - 0.5);
  return { word, ink, choices };
}
