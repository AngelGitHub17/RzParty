/**
 * Configuration d'un plateau : longueur, proportions de cases et règles.
 * Les longueurs prédéfinies (Court… Marathon) ont leur configuration fixe ;
 * la longueur « Personnalisé » laisse le chef tout régler.
 */
import type { BoardSize } from "./board.ts";

/** Types de cases dont on peut régler la proportion. */
export const CONFIGURABLE_CELLS = ["vide", "bonus", "malus", "piege", "boutique", "ovni", "duel", "evenement"] as const;
export type ConfigurableCell = (typeof CONFIGURABLE_CELLS)[number];

export interface BoardConfig {
  /** Nombre de cases du chemin principal. */
  length: number;
  /** Proportions relatives des cases (0 = jamais). */
  weights: Record<ConfigurableCell, number>;
  /** Pièces prises au perdant d'un duel. */
  duelStake: number;
  /** Nombre d'embranchements (détours) voulus. */
  forks: number;
  bonusSteps: number;
  malusSteps: number;
  /** Pièces de chacun au départ. */
  startCoins: number;
  /** Multiplie les pièces gagnées aux mini-jeux. */
  coinMultiplier: number;
  /** Dés bonus (6, 4, 3 faces) pour les 3 premiers du mini-jeu. */
  bonusDice: boolean;
  /** Double sur 2 dés : un 3e dé est lancé. */
  doubles: boolean;
  /** Objets portables en même temps (0 = boutiques fermées). */
  maxItems: number;
  /** Un mini-jeu tous les N tours de plateau. */
  miniGameEvery: number;
  /** Nombre de tours maximum (0 = sans limite). Au-delà, le plus proche de l'arrivée gagne. */
  maxRounds: number;
  /** Évite les cases spéciales identiques à la suite et les longues séries de cases calmes. */
  variety: boolean;
}

type NumericKey = "duelStake" | "length" | "forks" | "bonusSteps" | "malusSteps" | "startCoins" | "coinMultiplier" | "maxItems" | "miniGameEvery" | "maxRounds";

/** Bornes des réglages (utilisées par la validation et par l'interface). */
export const CONFIG_LIMITS: Record<NumericKey, { min: number; max: number; label: string; help?: string }> = {
  length: { min: 10, max: 2000, label: "Nombre de cases" },
  forks: { min: 0, max: 60, label: "Embranchements", help: "Détours plus longs mais plus riches en surprises." },
  bonusSteps: { min: 1, max: 12, label: "Avance d'une case bleue" },
  malusSteps: { min: 1, max: 12, label: "Recul d'une case rouge" },
  startCoins: { min: 0, max: 500, label: "Pièces au départ" },
  coinMultiplier: { min: 1, max: 5, label: "Multiplicateur de pièces", help: "Les gains des mini-jeux sont multipliés." },
  maxItems: { min: 0, max: 4, label: "Objets portables", help: "0 : les boutiques sont fermées." },
  duelStake: { min: 1, max: 100, label: "Mise d'un duel", help: "Pièces que le gagnant prend au perdant." },
  miniGameEvery: { min: 1, max: 5, label: "Mini-jeu tous les … tours" },
  maxRounds: { min: 0, max: 500, label: "Limite de tours", help: "0 : sans limite. À la fin, le plus proche de l'arrivée gagne." },
};
export const WEIGHT_MAX = 100;

const BASE: Omit<BoardConfig, "length" | "forks" | "bonusDice"> = {
  weights: { vide: 44, bonus: 22, malus: 18, piege: 7, boutique: 0, ovni: 3, duel: 3, evenement: 3 },
  duelStake: 10,
  bonusSteps: 4,
  malusSteps: 4,
  startCoins: 0,
  coinMultiplier: 1,
  doubles: true,
  maxItems: 2,
  miniGameEvery: 1,
  maxRounds: 0,
  variety: true,
};

const PRESET_LENGTHS: Record<Exclude<BoardSize, "perso">, number> = { court: 30, moyen: 45, long: 60, "tres-long": 80, marathon: 100 };

/** Configuration d'une longueur prédéfinie (les boutiques y sont placées à intervalles réguliers). */
export function presetConfig(size: Exclude<BoardSize, "perso">): BoardConfig {
  const length = PRESET_LENGTHS[size];
  return {
    ...structuredClone(BASE),
    length,
    forks: Math.min(5, Math.max(3, Math.round(length / 18))),
    bonusDice: size === "long" || size === "tres-long" || size === "marathon",
  };
}

/** Configuration personnalisée par défaut : un plateau moyen, boutiques comprises. */
export function defaultCustomConfig(): BoardConfig {
  return { ...presetConfig("moyen"), weights: { vide: 40, bonus: 20, malus: 16, piege: 7, boutique: 8, ovni: 3, duel: 3, evenement: 3 }, bonusDice: true };
}

export function configFor(board: { size: BoardSize; custom: BoardConfig }): BoardConfig {
  return board.size === "perso" ? board.custom : presetConfig(board.size);
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Applique des modifications venues du réseau en bornant chaque valeur (rien d'inconnu ne passe). */
export function patchConfig(current: BoardConfig, raw: unknown): BoardConfig {
  const next = structuredClone(current);
  if (!raw || typeof raw !== "object") return next;
  const p = raw as Partial<Record<keyof BoardConfig, unknown>>;
  for (const key of Object.keys(CONFIG_LIMITS) as NumericKey[]) {
    if (key in p) next[key] = clampInt(p[key], CONFIG_LIMITS[key].min, CONFIG_LIMITS[key].max, next[key]);
  }
  for (const key of ["bonusDice", "doubles", "variety"] as const) if (typeof p[key] === "boolean") next[key] = p[key] as boolean;
  if (p.weights && typeof p.weights === "object") {
    const w = p.weights as Record<string, unknown>;
    for (const cell of CONFIGURABLE_CELLS) if (cell in w) next.weights[cell] = clampInt(w[cell], 0, WEIGHT_MAX, next.weights[cell]);
  }
  // Au moins un type de case doit pouvoir sortir.
  if (CONFIGURABLE_CELLS.every((c) => next.weights[c] === 0)) next.weights.vide = 1;
  return next;
}
