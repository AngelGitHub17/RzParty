/** Données échangées par le mini-jeu « Piratage » (code secret façon Mastermind). */

export const PIRATAGE_DURATION_MS = 60_000;
export const CODE_LENGTH = 4;
export const DIGITS = ["1", "2", "3", "4", "5", "6"] as const;
export const MAX_TRIES = 10;

export interface Feedback {
  /** Bons chiffres bien placés. */
  exact: number;
  /** Bons chiffres mal placés. */
  near: number;
}

export interface PiratageState {
  endsAt: number;
  /** Par joueur : essais faits, meilleur résultat, trouvé ou non. */
  progress: Record<string, { tries: number; best: Feedback; cracked: boolean; history: Feedback[] }>;
  finished: boolean;
  /** Le code, révélé à la fin seulement. */
  code: string | null;
}

/** Verdict d'un chiffre, à sa place : bien placé, présent ailleurs, absent du code. */
export type Mark = "exact" | "near" | "none";

/** Envoyé à chaque joueur : ses propres essais, avec le verdict de chaque chiffre à sa place. */
export interface PiratagePrivate {
  guesses: { guess: string; feedback: Feedback; marks: Mark[] }[];
}

export interface PiratageInput {
  guess: string;
}

export function score(code: string, guess: string): Feedback {
  let exact = 0;
  let near = 0;
  for (let i = 0; i < code.length; i++) {
    if (guess[i] === code[i]) exact++;
    else if (code.includes(guess[i]!)) near++;
  }
  return { exact, near };
}

/** Verdict chiffre par chiffre (les chiffres du code sont tous différents). */
export function marksFor(code: string, guess: string): Mark[] {
  return guess.split("").map((d, i) => (code[i] === d ? "exact" : code.includes(d) ? "near" : "none"));
}

export function isValidGuess(guess: unknown): guess is string {
  return typeof guess === "string" && /^[1-6]{4}$/.test(guess) && new Set(guess).size === CODE_LENGTH;
}

/** Tous les codes possibles (360). */
export function allCodes(): string[] {
  const out: string[] = [];
  const rec = (prefix: string) => {
    if (prefix.length === CODE_LENGTH) return void out.push(prefix);
    for (const d of DIGITS) if (!prefix.includes(d)) rec(prefix + d);
  };
  rec("");
  return out;
}
