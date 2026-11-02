/**
 * Mode « Grande Roue » : chacun fait tourner la roue à son tour pour gagner des médailles.
 * Des cases déclenchent un mini-jeu dont le gagnant rafle la cagnotte.
 */
export type WheelKind = "gain" | "double" | "perte" | "banqueroute" | "minijeu" | "vol" | "cagnotte";

export interface WheelSegment {
  kind: WheelKind;
  value: number;
  label: string;
  color: string;
}

export const WHEEL_SEGMENTS: WheelSegment[] = [
  { kind: "gain", value: 10, label: "+10", color: "#2F7BEF" },
  { kind: "minijeu", value: 0, label: "Mini-jeu", color: "#F25FA8" },
  { kind: "gain", value: 30, label: "+30", color: "#2DB866" },
  { kind: "perte", value: 20, label: "−20", color: "#F0483E" },
  { kind: "gain", value: 20, label: "+20", color: "#FF8A1F" },
  { kind: "double", value: 2, label: "×2", color: "#9257E8" },
  { kind: "gain", value: 10, label: "+10", color: "#2F7BEF" },
  { kind: "vol", value: 15, label: "Vol", color: "#18BDBD" },
  { kind: "gain", value: 50, label: "+50", color: "#F2B705" },
  { kind: "banqueroute", value: 0, label: "Banqueroute", color: "#1E2A4A" },
  { kind: "gain", value: 20, label: "+20", color: "#FF8A1F" },
  { kind: "minijeu", value: 0, label: "Mini-jeu", color: "#F25FA8" },
];

export const WHEEL_ROUND_CHOICES = [3, 5, 8] as const;
/** Cagnotte de départ, remise en jeu à chaque mini-jeu. */
export const WHEEL_START_POT = 30;

export interface WheelTurn {
  playerId: string;
  phase: "spin" | "spinning" | "result";
  /** Case tirée (connue dès le lancer pour que l'animation s'y arrête). */
  segment: number | null;
  /** Change à chaque lancer : déclenche l'animation. */
  spinId: number;
  text: string | null;
  endsAt: number | null;
}

export interface WheelState {
  segments: WheelSegment[];
  medals: Record<string, number>;
  pot: number;
  order: string[];
  turn: WheelTurn | null;
  round: number;
  rounds: number;
}
