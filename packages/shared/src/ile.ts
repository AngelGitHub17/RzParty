/**
 * Mode « Île aux défis » : une course de 72 cases jusqu'au sommet d'une île, avec 6 défis en chemin
 * et un volcan où l'on peut tomber. Les données sont communes au serveur et à l'interface.
 */
import { createRng } from "./random.ts";

export type IleCellType =
  | "depart"
  | "vide"
  | "plus4"
  | "plus5"
  | "plus6"
  | "moins4"
  | "tornade"
  | "ovni"
  | "unvstous"
  | "duel"
  | "dino"
  | "statue-bleue"
  | "statue-rouge"
  | "eruption"
  | "crane";

/** Cases de l'île : 0 (départ) à 71 ; 72 = le sommet, devant le défi final. */
export const ILE_LAST_CELL = 71;
export const ILE_SUMMIT = 72;

export type IleGateKind = "liane" | "dragon" | "caisses" | "volcan" | "boule" | "final";

/** Les 6 défis, placés juste après une case (on s'arrête devant pour le tenter). */
export const ILE_GATES: { after: number; kind: IleGateKind; label: string; help: string }[] = [
  { after: 5, kind: "liane", label: "Saut à la liane", help: "Un dé décide jusqu'où tu sautes : on passe toujours." },
  { after: 21, kind: "dragon", label: "Mur du dragon", help: "Fais 4 ou plus pour briser la statue. Une fois brisée, le passage est ouvert à tous." },
  { after: 38, kind: "caisses", label: "Caisses ou tonneaux", help: "Choisis un chemin sur la cascade : s'il casse, tu nages et tu perds le reste de ton déplacement." },
  { after: 45, kind: "volcan", label: "Volcan ou pas", help: "Fais 3 ou plus. Sinon, tu tombes dans le volcan !" },
  { after: 55, kind: "boule", label: "Boule à pointes", help: "Fais 5 ou plus (un de moins à chaque échec). Raté : la boule dévale et fait reculer de 11 cases ceux qui sont entre le 4e et le 5e défi." },
  { after: ILE_LAST_CELL, kind: "final", label: "Défi final", help: "Au sommet : au tour suivant, fais 6 ou plus avec tes dés pour briser la statue et gagner." },
];

/** Le volcan : 10 cases à part ; la sortie (ou la case « Cri ») ramène sur l'île juste après le 4e défi. */
export type IleVolcanoCell = "entree" | "plus4" | "vide" | "cri" | "sortie";
export const ILE_VOLCANO: IleVolcanoCell[] = ["entree", "plus4", "vide", "plus4", "cri", "vide", "vide", "vide", "vide", "sortie"];
export const ILE_VOLCANO_EXIT = 46;

/** Spike ball : les joueurs entre le 4e et le 5e défi reculent de tant de cases. */
export const ILE_SPIKE_BACK = 11;
/** Éruption : les cases spéciales deviennent des « −4 » pendant ce nombre de tours. */
export const ILE_ERUPTION_ROUNDS = 3;

export const ILE_CELL_INFO: Record<IleCellType, { label: string; symbol: string; color: string; help: string }> = {
  depart: { label: "Départ", symbol: "D", color: "#FFFFFF", help: "Tout le monde part d'ici." },
  vide: { label: "Case calme", symbol: "", color: "#F2E0B6", help: "Rien ne se passe." },
  plus4: { label: "+4", symbol: "+4", color: "#2F7BEF", help: "Avance de 4 cases." },
  plus5: { label: "+5", symbol: "+5", color: "#2F7BEF", help: "Avance de 5 cases." },
  plus6: { label: "+6", symbol: "+6", color: "#2F7BEF", help: "Avance de 6 cases." },
  moins4: { label: "−4", symbol: "−4", color: "#F0483E", help: "Recule de 4 cases." },
  tornade: { label: "Tornade", symbol: "🌪", color: "#8E9AAF", help: "Un adversaire tiré au sort recule de 4 à 6 cases." },
  ovni: { label: "OVNI", symbol: "🛸", color: "#18BDBD", help: "Tu échanges ta place avec un adversaire tiré au sort." },
  unvstous: { label: "1 contre tous", symbol: "1:3", color: "#9257E8", help: "Mini-jeu seul contre tous : si tu fais mieux que la moyenne des autres, avance de 10 cases." },
  duel: { label: "Duel", symbol: "VS", color: "#2DB866", help: "Défie qui tu veux : si tu gagnes, tu avances de 7 et ton adversaire recule de 7." },
  dino: { label: "Dino", symbol: "🦖", color: "#7BCB3A", help: "Ptérodactyle : avance de 10. T-rex : recule de 4 à 9." },
  "statue-bleue": { label: "Statue bleue", symbol: "🗿", color: "#1E5BC6", help: "Elle te propulse de 16 à 18 cases en avant !" },
  "statue-rouge": { label: "Statue rouge", symbol: "🗿", color: "#B3261E", help: "Elle te renvoie 18 cases en arrière !" },
  eruption: { label: "Éruption", symbol: "🌋", color: "#FF8A1F", help: "Le volcan entre en éruption : pendant 3 tours, toutes les cases spéciales font reculer de 4." },
  crane: { label: "Crâne", symbol: "💀", color: "#3C3C46", help: "Direction le volcan !" },
};

/** Nombre de cases de chaque sorte (le reste est calme). */
const COUNTS: Partial<Record<IleCellType, number>> = {
  plus4: 5,
  plus5: 3,
  plus6: 2,
  moins4: 6,
  tornade: 3,
  ovni: 3,
  unvstous: 4,
  duel: 4,
  dino: 3,
  "statue-bleue": 1,
  "statue-rouge": 1,
  eruption: 2,
  crane: 2,
};

/** Où chaque sorte de case a le droit d'être (pour que la course reste juste). */
function allowed(type: IleCellType, cell: number): boolean {
  if (cell <= 2 || cell >= ILE_LAST_CELL - 1) return false;
  // Pas de case spéciale juste devant un défi : on s'y arrête souvent.
  if (ILE_GATES.some((g) => g.after === cell)) return false;
  if (type === "statue-rouge") return cell >= 24;
  if (type === "statue-bleue") return cell <= 50;
  if (type === "crane") return cell >= 15 && cell <= 64;
  if (type === "eruption") return cell >= 10;
  return true;
}

/** L'île d'une partie : mêmes proportions à chaque fois, emplacements tirés au sort (graine reproductible). */
export function generateIsland(seed: number): IleCellType[] {
  const random = createRng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells: IleCellType[] = Array.from({ length: ILE_LAST_CELL + 1 }, (_, i) => (i === 0 ? "depart" : "vide"));
    const bag = Object.entries(COUNTS).flatMap(([t, n]) => Array.from({ length: n! }, () => t as IleCellType));
    // Les plus contraintes d'abord.
    bag.sort((a, b) => (a.startsWith("statue") || a === "crane" ? -1 : 0) - (b.startsWith("statue") || b === "crane" ? -1 : 0) || random() - 0.5);
    let ok = true;
    for (const type of bag) {
      const spots = cells
        .map((t, i) => i)
        .filter((i) => cells[i] === "vide" && allowed(type, i) && cells[i - 1] !== type && cells[i + 1] !== type);
      if (!spots.length) {
        ok = false;
        break;
      }
      cells[spots[Math.floor(random() * spots.length)]!] = type;
    }
    // Au plus 3 cases calmes d'affilée.
    if (ok && !/(vide,){4}/.test(cells.join(",") + ",")) return cells;
  }
  // Dernier recours (jamais atteint en pratique) : une île sans contrainte d'alternance.
  return Array.from({ length: ILE_LAST_CELL + 1 }, (_, i) => (i === 0 ? "depart" : "vide"));
}

/** Défi entre `cell` et la case suivante, s'il y en a un. */
export function gateAfter(cell: number): number {
  return ILE_GATES.findIndex((g) => g.after === cell);
}

/** Position d'un joueur. */
export interface IlePawn {
  /** Case sur l'île (0 à 72, 72 = au sommet). */
  cell: number;
  /** Case dans le volcan, ou null. */
  volcano: number | null;
}

export interface IleRoll {
  /** Dé normal (1 à 6). */
  std: number;
  /** Dé bonus (or 1-6, argent 1-3, bronze 1-2) et sa valeur maximale. */
  bonus: number | null;
  bonusMax: number | null;
  /** Dé en plus quand le dé normal et le dé bonus font le même chiffre. */
  extra: number | null;
  total: number;
}

export interface IleTurn {
  playerId: string;
  phase: "roll" | "move" | "challenge" | "choose" | "effect" | "done";
  roll: IleRoll | null;
  /** Défi en cours : jet demandé et résultat. */
  challenge: { gate: number; need: number | null; value: number | null; ok: boolean | null; choice?: number; broken?: number } | null;
  /** Choix attendu du joueur : chemin (caisses/tonneaux) ou adversaire (duel). */
  choose: { kind: "chemin" | "duel"; options: string[] } | null;
  /** Ce qui vient de se passer, en une phrase. */
  message: string;
  endsAt: number | null;
}

export interface IleState {
  cells: IleCellType[];
  pawns: Record<string, IlePawn>;
  /** Dé bonus gagné au dernier mini-jeu (6, 3, 2) ou null. */
  bonus: Record<string, number | null>;
  order: string[];
  round: number;
  dragonBroken: boolean;
  /** Jet demandé à chacun pour la boule à pointes (5, puis un de moins à chaque échec). */
  spikeNeed: Record<string, number>;
  /** Tours d'éruption restants. */
  eruption: number;
  turn: IleTurn | null;
  /** Dernière case touchée par un effet (animation). */
  flash: { playerId: string; text: string } | null;
}

/** Nom des dés bonus. */
export const ILE_BONUS_NAMES: Record<number, string> = { 6: "dé d'or", 3: "dé d'argent", 2: "dé de bronze" };

/** Dé bonus selon la place au mini-jeu (rien pour le dernier groupe). */
export function ileBonusForPlace(place: number, groups: number): number | null {
  if (place >= groups - 1) return null;
  return [6, 3, 2][place] ?? null;
}

/** Avance d'un effet : on s'arrête devant le prochain défi encore fermé (on n'entre jamais au sommet par un effet). */
export function clampForward(from: number, to: number, dragonBroken: boolean): number {
  for (let c = from; c < to; c++) {
    const g = gateAfter(c);
    if (g >= 0 && !(ILE_GATES[g]!.kind === "dragon" && dragonBroken)) return c;
  }
  return Math.min(to, ILE_LAST_CELL);
}

/** Cases sur une spirale qui monte vers le sommet (coordonnées dans un rectangle de 1000 × 720), à intervalles réguliers. */
export function ileLayout(): { x: number; y: number }[] {
  const n = ILE_LAST_CELL + 2;
  const turns = 2.05;
  const samples: { x: number; y: number }[] = [];
  for (let k = 0; k <= 4000; k++) {
    const t = k / 4000;
    const angle = Math.PI * 0.5 + t * Math.PI * 2 * turns;
    const r = 1 - t * 0.78;
    samples.push({ x: 500 + Math.cos(angle) * 450 * r, y: 370 + Math.sin(angle) * 315 * r });
  }
  const along = [0];
  for (let k = 1; k < samples.length; k++) along.push(along[k - 1]! + Math.hypot(samples[k]!.x - samples[k - 1]!.x, samples[k]!.y - samples[k - 1]!.y));
  const total = along.at(-1)!;
  const out: { x: number; y: number }[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (k < along.length - 1 && along[k]! < target) k++;
    out.push(samples[k]!);
  }
  return out;
}
