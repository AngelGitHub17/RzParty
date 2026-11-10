/** Données et physique du mini-jeu « Alunissage » (la même simulation tourne partout). */

export const LANDING_ROUNDS = 2;
export const LAND_READY_MS = 2500;
export const LAND_MAX_MS = 32_000;
export const LAND_RESULT_MS = 3200;

export const START_ALT = 60;
export const START_SPEED = 2;
export const GRAVITY = 1.62;
export const THRUST = 3.4;
/** Carburant : secondes de moteur. */
export const FUEL = 16;
export const SAFE_SPEED = 5;
export const STEP_MS = 20;
export const MAX_TOGGLES = 300;

export interface Flight {
  /** Altitude (m), vitesse de chute (m/s, positive vers le bas), carburant restant (s). */
  alt: number;
  speed: number;
  fuel: number;
  /** Moteur allumé à cet instant. */
  thrust: boolean;
  /** Instant du contact avec le sol (ms), ou null. */
  landedAt: number | null;
}

/**
 * Simule le vol jusqu'à `untilMs` (ms depuis le départ). `toggles` : instants (croissants)
 * où le moteur change d'état, en commençant éteint.
 */
export function simulate(toggles: readonly number[], untilMs: number): Flight {
  let alt = START_ALT;
  let speed = START_SPEED;
  let fuel = FUEL;
  let next = 0;
  let thrust = false;
  const end = Math.min(untilMs, LAND_MAX_MS);
  for (let t = 0; t < end; t += STEP_MS) {
    while (next < toggles.length && toggles[next]! <= t) {
      thrust = !thrust;
      next++;
    }
    const on = thrust && fuel > 0;
    const dt = STEP_MS / 1000;
    if (on) fuel = Math.max(0, fuel - dt);
    speed += (GRAVITY - (on ? THRUST : 0)) * dt;
    alt -= speed * dt;
    if (alt <= 0) return { alt: 0, speed, fuel, thrust: on, landedAt: t + STEP_MS };
  }
  return { alt, speed, fuel, thrust: thrust && fuel > 0, landedAt: null };
}

/** Points d'un atterrissage : 0 si crash, sinon de 50 à 100 selon la douceur (et un peu le carburant restant). */
export function landingScore(f: Flight): number {
  if (f.landedAt === null || f.speed > SAFE_SPEED) return 0;
  const soft = Math.max(0, (SAFE_SPEED - Math.max(0, f.speed)) / SAFE_SPEED);
  return Math.round(50 + soft * 40 + (f.fuel / FUEL) * 10);
}

/** Vitesse de chute conseillée à cette altitude (l'aiguille doit rester sous ce repère). */
export function advisedSpeed(alt: number): number {
  return Math.min(SAFE_SPEED + 6, 2 + alt * 0.12);
}

export function landingLabel(f: Flight | null): string {
  if (!f || f.landedAt === null) return "Perdu dans l'espace";
  if (f.speed > SAFE_SPEED) return `Crash ! (${f.speed.toFixed(1)} m/s)`;
  return `${landingScore(f)} pts (${f.speed.toFixed(1)} m/s)`;
}

/** Vérifie qu'une liste d'instants est valide (nombres entiers croissants). */
export function validToggles(t: unknown): t is number[] {
  if (!Array.isArray(t) || t.length > MAX_TOGGLES) return false;
  let prev = -1;
  for (const v of t) {
    if (typeof v !== "number" || !Number.isInteger(v) || v <= prev || v < 0) return false;
    prev = v;
  }
  return true;
}

export interface AlunissageState {
  round: number;
  rounds: number;
  phase: "ready" | "fly" | "result" | "done";
  /** Départ du vol, en temps serveur. */
  startedAt: number;
  phaseEndsAt: number;
  /** Commandes de moteur reçues pour chaque joueur (pour dessiner les autres capsules). */
  toggles: Record<string, number[]>;
  /** Résultat de l'essai en cours, une fois posé. */
  landed: Record<string, { score: number; speed: number; crashed: boolean }>;
  best: Record<string, number>;
}

export interface AlunissageInput {
  round: number;
  toggles: number[];
}
