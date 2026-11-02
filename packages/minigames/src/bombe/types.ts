/** Données échangées par le mini-jeu « Patate explosive ». */

/** Mots courts, sans accents, pour taper vite au doigt comme à la souris. */
export const WORDS = [
  "BOUM", "FEU", "TIC", "TAC", "PAF", "ZUT", "VITE", "COURS", "HOP", "OUPS",
  "CHAUD", "MECHE", "PATATE", "SAUTE", "FILE", "PASSE", "VOLE", "OUF", "BRAVO", "TOP",
  "LAPIN", "PIZZA", "ROBOT", "NUAGE", "SUPER", "JOUE", "ZOOM", "BOND", "FUSEE", "RIRE",
];

export const FUSE_MIN_MS = 9_000;
export const FUSE_MAX_MS = 17_000;
/** Pause après une explosion, avant la bombe suivante. */
export const BLAST_PAUSE_MS = 2_500;

export interface BombeState {
  /** Joueur qui tient la bombe (null pendant la pause après une explosion). */
  holder: string | null;
  /** Le mot à taper et les lettres proposées (mélangées, avec des leurres). */
  word: string;
  letters: string[];
  /** Lettres déjà tapées par le porteur. */
  progress: number;
  /** Numéro de la passe, pour ignorer les saisies périmées. */
  pass: number;
  /** Joueur à qui la bombe ira. */
  target: string | null;
  alive: string[];
  /** Éliminés, dans l'ordre. */
  out: string[];
  /** Dernière explosion (pour l'animation). */
  blast: { playerId: string; at: number } | null;
  /** La mèche raccourcit : 0 calme, 1 ça chauffe, 2 ça va péter (indice, jamais l'heure exacte). */
  heat: 0 | 1 | 2;
  finished: boolean;
}

export interface BombeInput {
  pass: number;
  /** Index de la lettre touchée dans `letters`. */
  letter: number;
}

const DECOYS = "ABCDEFGHIJLMNOPRSTUVZ";

/** Lettres du mot + leurres, mélangées, 8 boutons au plus (lettres répétées une seule fois). */
export function lettersFor(word: string, random: () => number): string[] {
  const set = [...new Set(word.split(""))];
  while (set.length < 8) {
    const c = DECOYS[Math.floor(random() * DECOYS.length)]!;
    if (!set.includes(c)) set.push(c);
  }
  for (let i = set.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [set[i], set[j]] = [set[j]!, set[i]!];
  }
  return set;
}
