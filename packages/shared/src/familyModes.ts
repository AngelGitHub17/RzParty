/**
 * Données et états des modes « Trios », « Bateau d'équilibre », « Paires cachées » et « Test d'amitié ».
 */
import { AVATAR_COLORS, randomAvatar, type Avatar } from "./avatar.ts";

/** Couleur « cachée » : le personnage porte une tenue sombre tant qu'on ne l'a pas choisi. */
export const HIDDEN_BODY = AVATAR_COLORS.findIndex((c) => c.id === "ardoise");

/** Un personnage dont la couleur de tenue compte (index dans AVATAR_COLORS). */
export function coloredAvatar(random: () => number, body: number): Avatar {
  const a = randomAvatar(random);
  a.body = body;
  if (a.accent === body) a.accent = (body + 5) % AVATAR_COLORS.length;
  return a;
}

// ───────────── Trios ─────────────

/** Les 6 couleurs de tenue des Trios (index dans AVATAR_COLORS) : tomate, soleil, sapin, océan, raisin, bonbon. */
export const TRIO_COLORS = [0, 2, 4, 7, 8, 9] as const;
/** Couleur « joker » : compte pour n'importe quelle couleur. */
export const TRIO_JOKER = -1;
export const TRIOS_ROUND_CHOICES = [4, 6, 8] as const;
/** Une rangée de 3 de la même couleur. */
export const TRIO_POINTS = 3;
/** Les deux rangées faites dans le même tour. */
export const DOUBLE_TRIO_POINTS = 10;

export interface TrioChar {
  avatar: Avatar;
  /** Index dans TRIO_COLORS, TRIO_JOKER, ou null si la couleur est encore cachée. */
  color: number | null;
}

export interface TriosState {
  round: number;
  rounds: number;
  phase: "pick" | "score";
  /** 6 personnages par joueur : 0-2 rangée du fond, 3-5 rangée de devant. */
  platforms: Record<string, TrioChar[]>;
  /** Personnages au centre (null : déjà pris). */
  center: (TrioChar | null)[];
  /** Ordre de passage du tour (décidé par le mini-jeu). */
  order: string[];
  turn: string | null;
  endsAt: number | null;
  scores: Record<string, number>;
  /** Dernier échange, pour l'animation. */
  lastSwap: { playerId: string; slot: number; center: number } | null;
  /** Trios marqués à la fin du tour. */
  scored: { playerId: string; rows: number[]; points: number }[];
}

/** Couleur commune d'une rangée de 3 (jokers compris), ou null. */
export function trioRowColor(row: (number | null)[]): number | null {
  if (row.some((c) => c === null)) return null;
  const real = row.filter((c) => c !== TRIO_JOKER) as number[];
  if (!real.length) return TRIO_JOKER;
  return real.every((c) => c === real[0]) ? real[0]! : null;
}

/** Rangées complètes (0 = fond, 1 = devant) d'un plateau de 6. */
export function trioRows(colors: (number | null)[]): number[] {
  return [0, 1].filter((r) => trioRowColor(colors.slice(r * 3, r * 3 + 3)) !== null);
}

export function trioPoints(rows: number): number {
  return rows >= 2 ? DOUBLE_TRIO_POINTS : rows === 1 ? TRIO_POINTS : 0;
}

// ───────────── Bateau d'équilibre ─────────────

/** 3 vergues (0 = en haut) de 10 places, 5 de chaque côté du mât. */
export const BOAT_YARDS = 3;
export const BOAT_PLACES = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5] as const;
/** Poids selon la taille (petit, moyen, gros). */
export const BOAT_WEIGHTS = [0, 1, 1.5, 2] as const;
/** Plus la vergue est haute, plus elle fait pencher le bateau. */
export const BOAT_LEVER = [1.4, 1.2, 1] as const;
/** Au-delà, le bateau chavire. */
export const BOAT_LIMIT = 8;
export const BOAT_GOAL_CHOICES = [15, 20] as const;
/** Couleur de tenue de chaque vergue (index dans AVATAR_COLORS) : pomme, soleil, raisin. */
export const BOAT_COLORS = [3, 2, 8] as const;
export const BOAT_SIZE_LABELS = ["", "petit", "moyen", "gros"] as const;

export interface BoatSailor {
  avatar: Avatar;
  yard: number;
  /** 1 petit, 2 moyen, 3 gros. */
  size: number;
}

export interface BateauState {
  goal: number;
  /** Personnages déjà à bord, avec leur place (-5 à 5, sans 0 : c'est le mât). */
  sailors: (BoatSailor & { slot: number; by: string })[];
  /** Penchant actuel (négatif : à gauche), coups de vent compris. Chavire au-delà de ±BOAT_LIMIT. */
  tilt: number;
  /** Penchant laissé par les coups de vent. */
  drift: number;
  /** Dernier coup de vent (pour l'annoncer). */
  gust: number;
  /** À placer ce tour-ci, dans l'ordre. */
  queue: { playerId: string; sailor: BoatSailor }[];
  /** Joueur qui place son personnage. */
  turn: string | null;
  phase: "place" | "sunk" | "won";
  /** Tour de jeu (un mini-jeu par tour). */
  round: number;
  endsAt: number | null;
}

/** Penchant produit par un personnage. */
export function boatTorque(s: { yard: number; size: number; slot: number }): number {
  return BOAT_WEIGHTS[s.size]! * s.slot * BOAT_LEVER[s.yard]!;
}

/** Places libres d'une vergue. */
export function boatFreeSlots(sailors: { yard: number; slot: number }[], yard: number): number[] {
  return BOAT_PLACES.filter((slot) => !sailors.some((s) => s.yard === yard && s.slot === slot));
}

// ───────────── Paires cachées ─────────────

/** 12 paires : les couleurs (index dans AVATAR_COLORS), toutes sauf la tenue « cachée ». */
export const PAIR_COLORS = AVATAR_COLORS.map((_, i) => i).filter((i) => i !== HIDDEN_BODY).slice(0, 12);
export const PAIRES_TOUR_CHOICES = [6, 10, 14] as const;
/** Un mini-jeu tous les 3 tours : le gagnant gagne un cœur. */
export const PAIRES_MINIGAME_EVERY = 3;

export interface PairCard {
  /** Le visage (la tenue est cachée tant que la carte n'est pas retournée). */
  avatar: Avatar;
  /** Couleur de tenue (index dans AVATAR_COLORS) si elle est visible, sinon null. */
  color: number | null;
  /** Joueur qui a trouvé la paire. */
  found: string | null;
  /** Vient de changer de place. */
  moved: boolean;
}

export interface PairesState {
  cards: PairCard[];
  /** Cartes retournées en ce moment (0, 1 ou 2). */
  flipped: number[];
  turn: string | null;
  /** Cœurs du joueur en cours (une erreur coûte un cœur). */
  hearts: number;
  /** Cœurs bonus gagnés aux mini-jeux, utilisés au prochain tour. */
  bonus: Record<string, number>;
  tour: number;
  tours: number;
  scores: Record<string, number>;
  phase: "flip" | "show";
  /** Dernier résultat : paire ou raté. */
  last: "paire" | "rate" | null;
  endsAt: number | null;
}

// ───────────── Test d'amitié ─────────────

export const AMITIE_ROUND_CHOICES = [5, 10, 15] as const;
/** Le mini-jeu final « synchro » compte comme 3 questions. */
export const AMITIE_FINAL_WEIGHT = 3;

export const AMITIE_DILEMMAS: [string, string, string][] = [
  ["Plutôt…", "Mer", "Montagne"],
  ["Plutôt…", "Chat", "Chien"],
  ["Plutôt…", "Sucré", "Salé"],
  ["Plutôt…", "Lève-tôt", "Couche-tard"],
  ["Plutôt…", "Film", "Série"],
  ["Plutôt…", "Pizza", "Burger"],
  ["Plutôt…", "Été", "Hiver"],
  ["Plutôt…", "Ville", "Campagne"],
  ["Plutôt…", "Thé", "Café"],
  ["Plutôt…", "Livre", "Jeu vidéo"],
  ["En vacances, plutôt…", "Tout prévoir", "Improviser"],
  ["Plutôt…", "Fête entre amis", "Soirée tranquille"],
  ["Plutôt…", "Voler", "Être invisible"],
  ["Plutôt…", "Passé", "Futur"],
  ["Plutôt…", "Chaud", "Froid"],
  ["Le dimanche, plutôt…", "Grasse matinée", "Sport au réveil"],
  ["Plutôt…", "Frites", "Purée"],
  ["Plutôt…", "Chanter", "Danser"],
  ["Plutôt…", "Appel", "Message"],
  ["Plutôt…", "Crêpes", "Gaufres"],
  ["Plutôt…", "Concert", "Cinéma"],
  ["Plutôt…", "Pluie", "Vent"],
  ["Plutôt…", "Dessert", "Entrée"],
  ["En voiture, plutôt…", "Conduire", "Être passager"],
  ["Plutôt…", "Bord de lac", "Bord de mer"],
  ["Plutôt…", "Chocolat noir", "Chocolat au lait"],
  ["Plutôt…", "Escape game", "Bowling"],
  ["Plutôt…", "Dragon", "Licorne"],
  ["Plutôt…", "Pirate", "Astronaute"],
  ["Plutôt…", "Fromage", "Charcuterie"],
  ["Au restaurant, plutôt…", "Le plat connu", "Le plat inconnu"],
  ["Plutôt…", "Ranger tout de suite", "Ranger plus tard"],
];

/** Questions « Qui… ? » : on désigne un joueur (le même que l'autre = synchro !). */
export const AMITIE_WHO: string[] = [
  "Qui est le plus gourmand ?",
  "Qui arrive toujours en retard ?",
  "Qui gagnerait à un concours de grimaces ?",
  "Qui survivrait le plus longtemps sur une île déserte ?",
  "Qui rit le plus fort ?",
  "Qui s'endort le premier en soirée ?",
  "Qui raconte les meilleures blagues ?",
  "Qui est le plus mauvais perdant ?",
  "Qui chante le plus faux ?",
  "Qui a la meilleure mémoire ?",
  "Qui dépense le plus vite son argent ?",
  "Qui serait le meilleur chef cuisinier ?",
];

export interface AmitieState {
  round: number;
  rounds: number;
  /** « choix » : deux propositions ; « qui » : on désigne un joueur. */
  kind: "choix" | "qui";
  question: string;
  /** Propositions (pour « qui » : les identifiants des joueurs). */
  options: string[];
  /** « final » : révélation du taux d'amitié de chaque duo (après le mini-jeu final). */
  phase: "answer" | "reveal" | "final";
  endsAt: number | null;
  answered: string[];
  /** Révélation : la réponse de chacun. */
  answers: Record<string, number> | null;
  /** Accords par duo (clé « idA|idB », triée) et nombre de questions comptées. */
  agree: Record<string, number>;
  asked: number;
}

/** Clé d'un duo, indépendante de l'ordre. */
export function duoKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Affinité d'un duo en pourcentage. */
export function affinity(state: Pick<AmitieState, "agree" | "asked">, a: string, b: string): number {
  if (!state.asked) return 0;
  return Math.round(Math.min(100, ((state.agree[duoKey(a, b)] ?? 0) / state.asked) * 100));
}
