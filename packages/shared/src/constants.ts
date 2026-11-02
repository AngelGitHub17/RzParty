/** Nom affiché du jeu. */
export const GAME_NAME = "RzParty";

/** Port HTTP + WebSocket du serveur (repris du concept d'origine). */
export const DEFAULT_PORT = 5555;

/** Joueurs maximum dans un salon, humains et bots confondus. */
export const MAX_PLAYERS = 8;

/** Joueurs minimum (humains + bots) pour lancer une partie. */
export const MIN_PLAYERS_TO_START = 2;

/** Longueur du code de salon. */
export const ROOM_CODE_LENGTH = 4;

/** Lettres utilisées pour les codes de salon (sans I, O, 0, 1 pour éviter les confusions). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Longueur maximale d'un pseudo. */
export const MAX_NAME_LENGTH = 16;

/**
 * Couleurs des joueurs, dans l'ordre d'attribution.
 * L'index de cette liste est la « couleur » d'un joueur dans tout le protocole.
 */
export const PLAYER_COLORS = [
  { id: "rouge", label: "Rouge", hex: "#F0483E" },
  { id: "bleu", label: "Bleu", hex: "#2F7BEF" },
  { id: "jaune", label: "Jaune", hex: "#F7C21B" },
  { id: "vert", label: "Vert", hex: "#2DB866" },
  { id: "violet", label: "Violet", hex: "#9257E8" },
  { id: "orange", label: "Orange", hex: "#FF8A1F" },
  { id: "rose", label: "Rose", hex: "#F45FAE" },
  { id: "turquoise", label: "Turquoise", hex: "#18BDBD" },
] as const;

export type PlayerColorIndex = number;

/** Équipes du mode Plateau (index = numéro d'équipe). */
export const TEAMS = [
  { id: "rouge", label: "Équipe Rouge", hex: "#F0483E" },
  { id: "bleue", label: "Équipe Bleue", hex: "#2F7BEF" },
  { id: "verte", label: "Équipe Verte", hex: "#2DB866" },
  { id: "jaune", label: "Équipe Jaune", hex: "#F2B705" },
] as const;

/** Nombres d'équipes proposés (0 = chacun pour soi). */
export const TEAM_CHOICES = [0, 2, 3, 4] as const;
