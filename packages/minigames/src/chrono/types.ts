/** Données échangées par le mini-jeu « Chrono à l'aveugle ». */

export const CHRONO_ROUNDS = 3;
export const CHRONO_READY_MS = 2200;
/** Le chrono reste visible au début, puis disparaît. */
export const CHRONO_VISIBLE_MS = 2500;
export const CHRONO_MARGIN_MS = 5000;
export const CHRONO_RESULT_MS = 3000;

export interface ChronoState {
  round: number;
  phase: "ready" | "run" | "result" | "done";
  /** Temps à viser, en millisecondes. */
  target: number;
  /** Départ du chrono (temps serveur). */
  startedAt: number;
  phaseEndsAt: number;
  /** Temps arrêtés à cette manche (révélés à la phase « result »). */
  stops: Record<string, number> | null;
  stopped: string[];
  /** Écart total cumulé, par joueur. */
  totals: Record<string, number>;
}

export interface ChronoInput {
  round: number;
  /** Temps mesuré par l'appareil entre l'affichage du départ et l'appui. */
  elapsed: number;
}

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(2).replace(".", ",")} s`;
