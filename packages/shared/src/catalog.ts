import type { BotPersonality, Difficulty, GameModeId } from "./types.ts";

/** Libellés et descriptions affichés dans l'interface. */
export const GAME_MODES: Record<GameModeId, { label: string; description: string }> = {
  survie: {
    label: "Survie",
    description: "Une suite de mini-jeux sans plateau. On perd des vies ou on vise un score.",
  },
  plateau: {
    label: "Plateau",
    description: "La course sur le plateau, avec pièces, boutique et embranchements.",
  },
  loto: {
    label: "Loto des copains",
    description: "Chacun son carton de personnages. Les boules tombent ; une boule Mini-jeu laisse le gagnant cocher la case de son choix. Première ligne complète : gagné !",
  },
  quiz: {
    label: "Quiz entre amis",
    description: "À tour de rôle, un joueur répond en secret à une question sur lui. Les autres doivent deviner sa réponse. Qui connaît le mieux ses amis ?",
  },
  mots: {
    label: "Bombe à mots",
    description: "Pour passer la bombe, donne un mot de la catégorie (écrit ou dit à voix haute, validé par les autres). Celui qui la tient quand elle explose prend un BOUM.",
  },
  roue: {
    label: "Grande Roue",
    description: "Joueurs et banque partent avec 500 médailles. La roue donne ou prend des médailles, gonfle la banque, ou lance une Bataille, un 1 contre tous ou un Duel. Elle change trois fois, et les prolongations durent jusqu'à la Bataille finale !",
  },
};

export const BOT_PERSONALITIES: Record<BotPersonality, { label: string; description: string; names: string[] }> = {
  equilibre: {
    label: "Équilibré",
    description: "Joue proprement, sans prendre de risque inutile.",
    names: ["Bilou", "Pompon", "Nestor", "Lulu"],
  },
  agressif: {
    label: "Agressif",
    description: "Rapide et téméraire, quitte à se tromper.",
    names: ["Turbo", "Rafale", "Crocs", "Zigzag"],
  },
  "lent-precis": {
    label: "Lent mais précis",
    description: "Prend son temps et se trompe rarement.",
    names: ["Tortilla", "Prudence", "Hibou", "Pépin"],
  },
  glitch: {
    label: "Glitch",
    description: "Imprévisible : génial ou complètement à côté.",
    names: ["Gl1tch", "Bzzt", "Err0r", "Pixou"],
  },
};

export const DIFFICULTIES: Record<Difficulty, { label: string }> = {
  facile: { label: "Facile" },
  moyen: { label: "Moyen" },
  difficile: { label: "Difficile" },
};

export const SURVIVAL_LIVES_CHOICES = [3, 5, 7] as const;
export const SURVIVAL_SCORE_CHOICES = [5, 10, 15] as const;
