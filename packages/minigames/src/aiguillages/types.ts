/** Données échangées par le mini-jeu « Aiguillages ». */

export const TRAIN_ROUNDS = 6;
export const SWITCHES = 3;
export const EXITS = 2 ** SWITCHES;
export const TRAIN_READY_MS = 1800;
export const TRAIN_CHOOSE_MS = 14_000;
export const TRAIN_RESULT_MS = 3200;

export const STATIONS = [
  { icon: "🏠", name: "Maison" },
  { icon: "🏰", name: "Château" },
  { icon: "🌲", name: "Forêt" },
  { icon: "🏖️", name: "Plage" },
  { icon: "⛰️", name: "Montagne" },
  { icon: "🏭", name: "Usine" },
  { icon: "🎡", name: "Fête foraine" },
  { icon: "🐄", name: "Ferme" },
] as const;

/** 0 = en haut, 1 = en bas, pour chaque aiguillage dans l'ordre. */
export type Path = (0 | 1)[];

/** Sortie atteinte par un chemin (0 = tout en haut). */
export function exitOf(path: Path): number {
  return path.reduce<number>((n, b) => n * 2 + b, 0);
}

export interface AiguillagesState {
  round: number;
  rounds: number;
  phase: "ready" | "choose" | "result" | "done";
  startedAt: number;
  phaseEndsAt: number;
  /** Gare (indice dans STATIONS) au bout de chaque sortie. */
  wiring: number[];
  target: number;
  /** Joueurs ayant envoyé leur réponse. */
  answered: string[];
  /** Résultat de la manche. */
  results: Record<string, { path: Path | null; ok: boolean; time: number | null; fastest: boolean }> | null;
  scores: Record<string, number>;
}

export interface AiguillagesInput {
  round: number;
  path: Path;
  /** Temps de réflexion mesuré sur l'appareil (ms). */
  t: number;
}
