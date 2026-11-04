/** Données et physique de « Course de haies » (la même simulation tourne partout). */

export const RACE_LENGTH = 120;
export const RACE_READY_MS = 2500;
export const RACE_MAX_MS = 32_000;
export const RACE_RESULT_MS = 3500;
export const HURDLES = 11;
export const STEP_MS = 20;
export const JUMP_MS = 440;
export const VMAX = 8;
const ACCEL = 5;
const TRIP_SPEED = 1.2;
export const MAX_JUMPS = 120;

export interface Run {
  x: number;
  speed: number;
  /** En l'air à cet instant. */
  air: boolean;
  /** Haies renversées (indices). */
  hit: number[];
  /** Arrivée (ms) ou null. */
  finishedAt: number | null;
  /** Instant où le coureur passe chaque haie (ms). */
  cross: number[];
}

/** Positions des haies (mètres), générées au départ. */
export function makeHurdles(random: () => number): number[] {
  const out: number[] = [];
  let x = 12;
  for (let i = 0; i < HURDLES; i++) {
    out.push(Math.round(x * 10) / 10);
    x += 7 + random() * 4.5;
  }
  return out.filter((h) => h < RACE_LENGTH - 4);
}

/** Simule la course jusqu'à `untilMs`. `jumps` : instants (croissants) des appuis. */
export function simulateRun(hurdles: readonly number[], jumps: readonly number[], untilMs: number): Run {
  let x = 0;
  let v = 0;
  let next = 0;
  let airUntil = -1;
  const hit: number[] = [];
  const cross: number[] = [];
  const end = Math.min(untilMs, RACE_MAX_MS);
  for (let t = 0; t < end; t += STEP_MS) {
    while (next < jumps.length && jumps[next]! <= t) {
      if (t >= airUntil) airUntil = jumps[next]! + JUMP_MS;
      next++;
    }
    const dt = STEP_MS / 1000;
    v = Math.min(VMAX, v + ACCEL * dt);
    const before = x;
    x += v * dt;
    const air = t < airUntil;
    hurdles.forEach((h, i) => {
      if (before < h && x >= h) {
        cross[i] = t;
        if (!air && !hit.includes(i)) {
          hit.push(i);
          v = TRIP_SPEED;
        }
      }
    });
    if (x >= RACE_LENGTH) return { x: RACE_LENGTH, speed: v, air: false, hit, finishedAt: t + STEP_MS, cross };
  }
  return { x, speed: v, air: end < airUntil, hit, finishedAt: null, cross };
}

export function validJumps(j: unknown): j is number[] {
  if (!Array.isArray(j) || j.length > MAX_JUMPS) return false;
  let prev = -1;
  for (const v of j) {
    if (typeof v !== "number" || !Number.isInteger(v) || v <= prev || v < 0 || v % STEP_MS !== 0) return false;
    prev = v;
  }
  return true;
}

export interface HaiesState {
  phase: "ready" | "run" | "result" | "done";
  hurdles: number[];
  startedAt: number;
  phaseEndsAt: number;
  jumps: Record<string, number[]>;
  /** Arrivées : temps (ms) et haies renversées. */
  finished: Record<string, { time: number | null; hits: number }>;
}

export interface HaiesInput {
  jumps: number[];
}
