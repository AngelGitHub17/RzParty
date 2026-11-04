/** Données et règles du mini-jeu « Tour de cadeaux » (empilement façon pile de boîtes). */

export const GIFTS = 14;
export const GIFTS_MS = 55_000;
export const AUTO_DROP_MS = 7000;
export const NEXT_GIFT_MS = 500;
/** Largeur de la zone (unités) et du premier socle. */
export const FIELD = 100;
export const BASE: [number, number] = [30, 70];
/** Lâcher presque parfait : le cadeau se cale sans rien perdre. */
export const PERFECT = 1.6;

/** Balancement du k-ième cadeau (le même pour tous) : de plus en plus rapide. */
export function giftSwing(k: number): { period: number; amp: number } {
  return { period: Math.max(950, 2300 - k * 110), amp: 34 };
}

/** Centre du cadeau `t` ms après son apparition. */
export function giftCenter(k: number, t: number): number {
  const { period, amp } = giftSwing(k);
  return FIELD / 2 + amp * Math.sin((2 * Math.PI * t) / period);
}

/** Pose un cadeau de largeur `width` centré en `center` sur le sommet `top`. Renvoie le nouveau sommet, ou null s'il tombe. */
export function dropGift(top: [number, number], center: number, width: number): { block: [number, number]; perfect: boolean } | null {
  const topCenter = (top[0] + top[1]) / 2;
  if (Math.abs(center - topCenter) <= PERFECT) return { block: [top[0], top[1]], perfect: true };
  const l = Math.max(top[0], center - width / 2);
  const r = Math.min(top[1], center + width / 2);
  if (r - l <= 0.5) return null;
  return { block: [Math.round(l * 10) / 10, Math.round(r * 10) / 10], perfect: false };
}

export interface Tower {
  blocks: [number, number][];
  /** Cadeau en cours (indice), apparu à `spawnAt` (temps serveur). */
  gift: number;
  spawnAt: number;
  /** Tour finie : cadeau tombé ou tous posés. */
  done: boolean;
  fell: boolean;
  perfect: number;
}

export interface CadeauxState {
  endsAt: number;
  towers: Record<string, Tower>;
  finished: boolean;
}

export interface CadeauxInput {
  gift: number;
  /** Temps écoulé depuis l'apparition du cadeau, mesuré sur l'appareil. */
  t: number;
}
