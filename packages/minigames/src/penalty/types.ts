/** Données échangées par le mini-jeu « Tirs au but ». */

export const SHOTS = 5;
export const AIM_MS = 6000;
export const SHOT_RESULT_MS = 2800;
/** Une jauge complète (aller-retour) dure ce temps. */
export const GAUGE_PERIOD_MS = 1400;
export const GREEN = [0.55, 0.92] as const;
export const GOLD = [0.72, 0.8] as const;

export type Dir = 0 | 1 | 2;
export const DIR_LABELS = ["Gauche", "Centre", "Droite"] as const;

/** Puissance (0 à 1) de la jauge, `t` ms après le début du tir. */
export function gauge(t: number): number {
  const phase = (t % GAUGE_PERIOD_MS) / GAUGE_PERIOD_MS;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

export type ShotOutcome = "but" | "arret" | "dessus" | "rate";

/** Résultat d'un tir selon la puissance, la direction et le plongeon du gardien. */
export function shotOutcome(power: number | null, dir: Dir | null, keeper: Dir): ShotOutcome {
  if (power === null || dir === null) return "rate";
  if (power > GREEN[1]) return "dessus";
  if (power >= GOLD[0] && power <= GOLD[1]) return "but";
  if (dir === keeper) return "arret";
  // Tir mou : le gardien rattrape aussi un ballon qui passe près de lui (centre ↔ côté).
  if (power < GREEN[0] && Math.abs(dir - keeper) === 1) return "arret";
  return "but";
}

export interface ShotResult {
  dir: Dir | null;
  power: number | null;
  keeper: Dir;
  outcome: ShotOutcome;
}

export interface PenaltyState {
  shot: number;
  shots: number;
  phase: "aim" | "result" | "done";
  /** Début de la visée, en temps serveur (la jauge part de zéro). */
  startedAt: number;
  phaseEndsAt: number;
  /** Ceux qui ont déjà tiré pendant la visée. */
  shot_done: string[];
  /** Résultats du tir (pendant la phase « result »). */
  results: Record<string, ShotResult> | null;
  /** Historique de chaque joueur. */
  history: Record<string, ShotOutcome[]>;
  goals: Record<string, number>;
}

export interface PenaltyInput {
  shot: number;
  dir: Dir;
  /** Temps écoulé depuis le début de la visée, mesuré sur l'appareil. */
  t: number;
}
