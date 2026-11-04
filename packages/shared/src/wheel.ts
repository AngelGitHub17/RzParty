/**
 * Mode « Grande Roue » : chacun fait tourner la roue à son tour. Tout le monde, banque comprise,
 * part avec 500 médailles. Les cases donnent ou prennent des médailles, gonflent la banque,
 * ou lancent un mini-jeu qui la met en jeu. La roue change trois fois au cours de la partie.
 */
export type WheelKind =
  | "gain" // le joueur reçoit des médailles de la banque
  | "perte" // le joueur perd des médailles, qui vont à la banque
  | "moitie" // le joueur perd la moitié de ses médailles, qui vont à la banque
  | "banque" // la banque reçoit des médailles
  | "multi" // la banque est multipliée
  | "bataille4" // mini-jeu à tous : le gagnant rafle la banque
  | "bataille13" // un contre tous : le lanceur seul contre les autres, la banque en jeu
  | "duel" // un contre un : le gagnant prend la moitié des médailles de l'adversaire
  | "chance"; // une petite roue : rien, la moitié ou toute la banque

export interface WheelSegment {
  kind: WheelKind;
  value: number;
  label: string;
  color: string;
}

const SEG: Record<string, WheelSegment> = {
  gain300: { kind: "gain", value: 300, label: "+300", color: "#2DB866" },
  perte300: { kind: "perte", value: 300, label: "−300", color: "#F0483E" },
  moitie: { kind: "moitie", value: 0, label: "½", color: "#B52A22" },
  banque500: { kind: "banque", value: 500, label: "Banque +500", color: "#2F7BEF" },
  banque600: { kind: "banque", value: 600, label: "Banque +600", color: "#1F5FC4" },
  banque800: { kind: "banque", value: 800, label: "Banque +800", color: "#183F8A" },
  x2: { kind: "multi", value: 2, label: "Banque ×2", color: "#9257E8" },
  x3: { kind: "multi", value: 3, label: "Banque ×3", color: "#6B33C9" },
  bataille4: { kind: "bataille4", value: 0, label: "Bataille", color: "#F2B705" },
  bataille13: { kind: "bataille13", value: 0, label: "1 contre tous", color: "#FF8A1F" },
  duel: { kind: "duel", value: 0, label: "Duel", color: "#F25FA8" },
  chance: { kind: "chance", value: 0, label: "Chance", color: "#18BDBD" },
};

/** Nombre de cases de chaque sorte, pour chaque étape de la partie (22 cases à chaque fois). */
const PHASES: Record<string, number>[] = [
  // Début de partie
  { banque500: 8, x2: 2, x3: 1, gain300: 5, perte300: 3, bataille4: 3 },
  // Milieu
  { banque500: 3, banque600: 3, x2: 1, x3: 1, gain300: 5, moitie: 3, chance: 1, bataille4: 3, bataille13: 1, duel: 1 },
  // Fin
  { banque600: 2, banque800: 2, x2: 3, x3: 1, gain300: 2, moitie: 4, chance: 1, bataille4: 3, bataille13: 1, duel: 3 },
  // Prolongations : la partie se termine sur la prochaine « Bataille »
  { banque600: 3, banque800: 4, gain300: 6, moitie: 5, bataille4: 4 },
];

/** Répartit les cases pour que les mêmes ne se suivent pas (toujours la même roue pour une étape). */
function layout(counts: Record<string, number>): WheelSegment[] {
  const pool = Object.entries(counts).flatMap(([k, n]) => Array.from({ length: n }, () => k));
  const total = pool.length;
  const slots: (string | null)[] = Array.from({ length: total }, () => null);
  // Les plus nombreuses d'abord, placées à intervalles réguliers.
  const kinds = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  let offset = 0;
  for (const [k, n] of kinds) {
    for (let i = 0; i < n; i++) {
      let pos = Math.floor(offset + (i * total) / n) % total;
      while (slots[pos] !== null) pos = (pos + 1) % total;
      slots[pos] = k;
    }
    offset += 1.7;
  }
  return slots.map((k) => SEG[k!]!);
}

export const WHEEL_PHASES: WheelSegment[][] = PHASES.map(layout);

/** Petite roue de la case « Chance ». */
export const LUCKY_OUTCOMES = [
  { share: 0, label: "Rien" },
  { share: 0.5, label: "Moitié de la banque" },
  { share: 1, label: "Toute la banque !" },
] as const;

export const WHEEL_ROUND_CHOICES = [5, 10, 15] as const;
export const WHEEL_START_MEDALS = 500;
export const WHEEL_START_BANK = 500;
export const WHEEL_BANK_MAX = 99_999;

/** Étape de la roue pour un tour donné (0 à 2), ou 3 pendant les prolongations. */
export function wheelPhase(round: number, rounds: number): number {
  if (round > rounds) return 3;
  if (round <= Math.round(rounds * 0.4)) return 0;
  if (round <= Math.round(rounds * 0.7)) return 1;
  return 2;
}

export interface WheelTurn {
  playerId: string;
  /**
   * spin : attend le lancer · spinning : la roue tourne · result : affichage ·
   * choose : le lanceur choisit son adversaire (duel) · pickgame : le dernier choisit le mini-jeu ·
   * lucky : la petite roue « Chance » tourne.
   */
  phase: "spin" | "spinning" | "result" | "choose" | "pickgame" | "lucky";
  /** Case tirée (connue dès le lancer pour que l'animation s'y arrête). */
  segment: number | null;
  /** Change à chaque lancer : déclenche l'animation. */
  spinId: number;
  text: string | null;
  endsAt: number | null;
  /** Résultat de la petite roue « Chance » (indice dans LUCKY_OUTCOMES). */
  lucky?: number;
  /** Adversaires possibles (duel) ou mini-jeux proposés (choix du dernier). */
  options?: { id: string; label: string }[];
  /** Qui choisit (le lanceur pour un duel, le dernier au classement pour le mini-jeu). */
  chooser?: string;
}

/** Mini-jeu en cours lancé par la roue. */
export interface WheelBattle {
  kind: "bataille4" | "bataille13" | "duel";
  /** Le joueur seul (1 contre tous) ou le lanceur du duel. */
  solo?: string;
  opponent?: string;
  bank: number;
}

export interface WheelState {
  segments: WheelSegment[];
  phase: number;
  medals: Record<string, number>;
  /** Médailles de la banque. */
  pot: number;
  order: string[];
  turn: WheelTurn | null;
  round: number;
  rounds: number;
  /** Prolongations : tour en cours (1 à 10), ou 0. */
  overtime: number;
  battle: WheelBattle | null;
}
