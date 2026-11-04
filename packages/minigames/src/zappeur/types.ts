/** Données échangées par le mini-jeu « Zappeur fou ». */

export const ZAP_ROUNDS = 5;
export const ZAP_READY_MS = 2200;
export const ZAP_RESULT_MS = 2600;
/** Temps pendant lequel la bonne chaîne reste à l'écran. */
export const ZAP_TARGET_MS = 1100;

export const CHANNELS = [
  { icon: "🐟", name: "Pêche TV", color: "#3fa7e0" },
  { icon: "🍳", name: "Cuisine+", color: "#f08a3e" },
  { icon: "⚽", name: "Sport 24", color: "#2db866" },
  { icon: "🌦️", name: "Météo", color: "#7fb2d6" },
  { icon: "🎤", name: "Karaoké", color: "#d65db1" },
  { icon: "🦁", name: "Safari", color: "#d9a20b" },
  { icon: "🚀", name: "Espace", color: "#5a4fcf" },
  { icon: "🎬", name: "Cinéma", color: "#c0392b" },
] as const;

export interface Zap {
  /** Chaîne affichée (indice dans CHANNELS). */
  channel: number;
  /** Début, en temps serveur. */
  at: number;
}

export interface ZappeurState {
  round: number;
  rounds: number;
  phase: "ready" | "zap" | "result" | "done";
  phaseEndsAt: number;
  /** Chaîne à trouver. */
  target: number;
  /** Zap en cours (index et chaîne). */
  zapIndex: number;
  zap: Zap | null;
  /** Joueurs bloqués (mauvaise chaîne) pendant cette manche. */
  locked: string[];
  /** Joueurs ayant trouvé (pendant la manche : sans les temps). */
  found: string[];
  /** Résultat de la manche : temps de réaction par joueur. */
  times: Record<string, number> | null;
  winner: string | null;
  scores: Record<string, number>;
}

export interface ZappeurInput {
  round: number;
  /** Zap vu par le joueur au moment de l'appui. */
  zap: number;
  /** Temps écoulé depuis l'apparition de ce zap sur l'appareil, en ms. */
  dt: number;
}
