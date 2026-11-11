/**
 * Données et états des « jeux de salon » qui se jouent avec les téléphones posés ou cachés dans la pièce :
 * « Cris en folie », « Cache-cache » et « Tic-tac-boum ».
 */

// ───────────── Cris en folie ─────────────

/** Les bêtes dont les téléphones imitent le cri (sons fabriqués par le navigateur, aucun fichier). */
export const CREATURES = [
  { id: "grenouille", label: "Grenouille", emoji: "🐸" },
  { id: "chat", label: "Chat", emoji: "🐱" },
  { id: "chien", label: "Chien", emoji: "🐶" },
  { id: "vache", label: "Vache", emoji: "🐮" },
  { id: "canard", label: "Canard", emoji: "🦆" },
  { id: "hibou", label: "Hibou", emoji: "🦉" },
  { id: "souris", label: "Souris", emoji: "🐭" },
  { id: "coq", label: "Coq", emoji: "🐓" },
] as const;

export type CreatureId = (typeof CREATURES)[number]["id"];

export const CRIS_POINT_CHOICES = [3, 5, 7] as const;

export interface CrisState {
  /** Manche en cours (1, 2…). */
  round: number;
  /** Points à atteindre pour gagner. */
  goal: number;
  /**
   * - `wait` : il manque des téléphones (au moins 2) ;
   * - `place` : on pose les téléphones au milieu de la table ;
   * - `listen` : chaque téléphone crie, il faut attraper celui de la bête affichée ;
   * - `claimed` : quelqu'un a attrapé le bon téléphone (ou personne) ;
   * - `done` : fin.
   */
  phase: "wait" | "place" | "listen" | "claimed" | "done";
  /** Cri de chaque téléphone (par identifiant du propriétaire), index dans CREATURES. */
  sounds: Record<string, number>;
  /** Bête à trouver (index dans CREATURES). */
  target: number | null;
  /** Échéance de la phase, en temps serveur. */
  endsAt: number | null;
  /** Début de la phase d'écoute (les téléphones calent leurs cris dessus). */
  listenAt: number | null;
  /** Joueurs qui se sont trompés pendant cette manche (ils ne peuvent plus attraper). */
  lockedOut: string[];
  /** Dernière tentative : qui, sur quel téléphone, et si c'était le bon. */
  lastClaim: { by: string; device: string; ok: boolean; at: number } | null;
  scores: Record<string, number>;
}

// ───────────── Cache-cache ─────────────

export const CACHE_TOUR_CHOICES = [1, 2] as const;
/** Durées, en millisecondes. */
export const CACHE_TIMINGS = {
  /** Le cacheur cache tous les téléphones. */
  hide: 75_000,
  /** Les chercheurs les retrouvent. */
  seek: 80_000,
  /** Chaque téléphone caché sonne toutes les… */
  ring: 10_000,
  reveal: 7_000,
  intro: 8_000,
};

export interface CacheState {
  /** Tour (chacun a caché une fois) et nombre de tours. */
  tour: number;
  tours: number;
  /** Manche (un cacheur par manche). */
  round: number;
  /**
   * - `wait` : il faut au moins 2 téléphones ;
   * - `intro` : on annonce le cacheur, les autres sortent ou ferment les yeux ;
   * - `hide` : le cacheur cache chaque téléphone et touche « Caché » dessus ;
   * - `seek` : les téléphones sonnent, les chercheurs touchent « Trouvé » ;
   * - `reveal` : bilan de la manche ;
   * - `done` : fin.
   */
  phase: "wait" | "intro" | "hide" | "seek" | "reveal" | "done";
  hider: string | null;
  /** Téléphones de la manche (identifiants de leurs propriétaires). */
  devices: string[];
  hidden: string[];
  /** Téléphone trouvé → qui l'a trouvé. */
  found: Record<string, string>;
  endsAt: number | null;
  /** Début de la recherche (les sonneries se calent dessus). */
  seekAt: number | null;
  scores: Record<string, number>;
  /** Bilan de la dernière manche. */
  last: { hider: string; found: number; total: number; seekersWin: boolean } | null;
}

/** Décalage de la sonnerie d'un téléphone caché (pour ne pas sonner tous en même temps). */
export function cacheRingOffset(index: number, count: number): number {
  return Math.round((CACHE_TIMINGS.ring / Math.max(1, count)) * index);
}

// ───────────── Tic-tac-boum ─────────────

export const TICTAC_BOMB_CHOICES = [3, 5, 8] as const;

/** Couleurs des fils à couper. */
export const WIRE_COLORS = [
  { id: "rouge", label: "rouge", hex: "#F0483E" },
  { id: "bleu", label: "bleu", hex: "#3D8BFF" },
  { id: "vert", label: "vert", hex: "#3DBE5B" },
  { id: "jaune", label: "jaune", hex: "#FFC83D" },
  { id: "violet", label: "violet", hex: "#9B5DE5" },
] as const;

export const BOMB_SYMBOLS = ["★", "♥", "♠", "♣", "♦", "☾", "☀", "✿"] as const;

/** Consigne à réussir pour passer la bombe. */
export type TictacTask =
  /** Couper le fil de cette couleur parmi ceux affichés. */
  | { kind: "fil"; wires: number[]; target: number }
  /** Appuyer exactement `count` fois sur la bombe, puis valider. */
  | { kind: "compte"; count: number }
  /** Maintenir le bouton entre `min` et `max` millisecondes. */
  | { kind: "maintiens"; min: number; max: number }
  /** Toucher les numéros dans l'ordre (les cases sont mélangées). */
  | { kind: "ordre"; cells: number[] }
  /** Toucher le symbole demandé parmi ceux affichés. */
  | { kind: "symbole"; symbols: number[]; target: number };

export interface TictacState {
  bomb: number;
  bombs: number;
  /** Qui tient la bombe. */
  holder: string | null;
  /** Ordre de passage autour de la table. */
  order: string[];
  /** Consigne du porteur. */
  task: TictacTask | null;
  /** Change à chaque nouvelle consigne (pour ignorer les réponses en retard). */
  taskId: number;
  /** Chaleur de la bombe (plus elle est rouge, plus elle va exploser). */
  heat: 0 | 1 | 2;
  /** Dernière erreur (la mèche raccourcit). */
  slip: { playerId: string; at: number } | null;
  /** Dernière passe, pour l'animation. */
  pass: { from: string; to: string; at: number } | null;
  booms: Record<string, number>;
  blast: { playerId: string; at: number } | null;
  phase: "play" | "boom" | "done";
}

/** Une réponse est-elle juste ? (Vérifiée par le serveur.) */
export function tictacAnswerOk(task: TictacTask, answer: unknown): boolean {
  switch (task.kind) {
    case "fil":
      return answer === task.target;
    case "symbole":
      return answer === task.target;
    case "compte":
      return answer === task.count;
    case "maintiens":
      return typeof answer === "number" && answer >= task.min && answer <= task.max;
    case "ordre": {
      if (!Array.isArray(answer) || answer.length !== task.cells.length) return false;
      // Les cases touchées doivent porter 1, 2, 3… dans l'ordre.
      return answer.every((cell, i) => typeof cell === "number" && task.cells[cell] === i + 1);
    }
  }
}

/** Texte de la consigne. */
export function tictacTaskText(task: TictacTask): string {
  switch (task.kind) {
    case "fil":
      return `Coupe le fil ${WIRE_COLORS[task.target]!.label} !`;
    case "symbole":
      return `Touche le ${BOMB_SYMBOLS[task.target]} !`;
    case "compte":
      return `Appuie ${task.count} fois sur la bombe, puis valide !`;
    case "maintiens":
      return `Maintiens le bouton ${Math.round(task.min / 1000)} à ${Math.round(task.max / 1000)} secondes, puis lâche !`;
    case "ordre":
      return `Touche les numéros de 1 à ${task.cells.length} dans l'ordre !`;
  }
}

// ───────────── L'intrus ─────────────

export const INTRUS_ROUND_CHOICES = [3, 5, 7] as const;
/** Mini-jeux où l'intrus reçoit des coups de pouce secrets. */
export const INTRUS_GAMES = ["vaetvient", "coupdoeil", "visage", "zappeur", "paires", "calcul"] as const;
/** Points : par place au mini-jeu, pour un bon soupçon, pour l'intrus qui passe inaperçu. */
export const INTRUS_POINTS = { places: [3, 2, 1], caught: 2, unseen: 3 };

export interface IntrusState {
  round: number;
  rounds: number;
  /**
   * - `brief` : un intrus est désigné en secret (lui seul le sait) ;
   * - `vote` : après le mini-jeu, chacun désigne qui a triché ;
   * - `reveal` : l'intrus est démasqué (ou pas) ;
   * - `done`.
   */
  phase: "brief" | "vote" | "reveal" | "done";
  endsAt: number | null;
  /** Mini-jeu de la manche (nom affiché). */
  game: string | null;
  /** Qui a déjà voté (le contenu des votes reste secret jusqu'à la révélation). */
  voted: string[];
  /** Révélation : l'intrus, les votes et les points de la manche. */
  reveal: { cheater: string; votes: Record<string, string>; gains: Record<string, number> } | null;
  scores: Record<string, number>;
}

// ───────────── Jeu libre ─────────────

export const LIBRE_ROUND_CHOICES = [5, 10, 15] as const;
export const LIBRE_POINTS = [3, 2, 1];

export interface LibreState {
  round: number;
  rounds: number;
  /** `pick` : le chef choisit le prochain mini-jeu. */
  phase: "pick" | "done";
  /** Mini-jeux déjà joués (identifiants), pour les repérer dans la liste. */
  played: string[];
  /** Mini-jeux jouables par les joueurs présents (identifiants). */
  choices: string[];
  scores: Record<string, number>;
}
