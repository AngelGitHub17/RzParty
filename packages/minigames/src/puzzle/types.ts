/** Données échangées par le mini-jeu « Puzzle express ». */

export const PUZZLE_MS = 40_000;
export const PUZZLE_PENALTY_MS = 1500;
export const PUZZLE_CHOICES = 4;
export const BANDS = 3;

export const PIECE_COLORS = ["#f0483e", "#3f7fe0", "#2db866", "#ffc83d", "#9b59d0"] as const;
export const PIECE_SHAPES = ["rond", "carre", "triangle", "etoile"] as const;

/** Une bande de l'image : une forme colorée coupée par le milieu. */
export interface Band {
  shape: number;
  color: number;
}

export interface PuzzleCard {
  index: number;
  /** Moitié gauche (les bandes de l'image d'origine). */
  left: Band[];
  /** Moitiés droites proposées : une seule a toutes les bandes identiques. */
  choices: Band[][];
}

export interface PuzzleState {
  endsAt: number;
  solved: Record<string, number>;
  /** Joueurs bloqués après une erreur, jusqu'à quand (temps serveur). */
  lockedUntil: Record<string, number>;
  finished: boolean;
}

/** Puzzle de chaque joueur (privé : chacun avance à son rythme). */
export interface PuzzlePrivate {
  card: PuzzleCard | null;
  /** Résultat du dernier essai, pour l'animation. */
  last: "ok" | "ko" | null;
}

export interface PuzzleInput {
  index: number;
  choice: number;
}

/** Fabrique le n-ième puzzle (le même pour tous, grâce au hasard tiré au départ). */
export function makeCard(index: number, random: () => number): { card: PuzzleCard; answer: number } {
  const pick = (n: number) => Math.floor(random() * n);
  const left: Band[] = Array.from({ length: BANDS }, () => ({ shape: pick(PIECE_SHAPES.length), color: pick(PIECE_COLORS.length) }));
  const answer = pick(PUZZLE_CHOICES);
  const seen = new Set<string>([JSON.stringify(left)]);
  const choices: Band[][] = [];
  for (let i = 0; i < PUZZLE_CHOICES; i++) {
    if (i === answer) {
      choices.push(left.map((b) => ({ ...b })));
      continue;
    }
    // Piège : une seule bande diffère (la forme ou la couleur).
    let fake: Band[];
    do {
      fake = left.map((b) => ({ ...b }));
      const band = fake[pick(BANDS)]!;
      if (random() < 0.5) band.shape = (band.shape + 1 + pick(PIECE_SHAPES.length - 1)) % PIECE_SHAPES.length;
      else band.color = (band.color + 1 + pick(PIECE_COLORS.length - 1)) % PIECE_COLORS.length;
    } while (seen.has(JSON.stringify(fake)));
    seen.add(JSON.stringify(fake));
    choices.push(fake);
  }
  return { card: { index, left, choices }, answer };
}
