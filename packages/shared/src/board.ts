/**
 * Plateau du mode Plateau : un graphe de cases généré au hasard (graine reproductible).
 * Le chemin principal serpente en rangées ; les embranchements partent d'une rangée,
 * font un détour dans l'espace entre deux rangées, puis rejoignent la même rangée plus loin.
 * Les détours sont plus longs mais plus riches en surprises (chemins « risqués »).
 */
import { createRng } from "./random.ts";
import { presetConfig, type BoardConfig } from "./boardConfig.ts";

export type CellType = "depart" | "arrivee" | "vide" | "bonus" | "malus" | "piege" | "boutique" | "duel" | "ovni" | "evenement";

export interface BoardCell {
  id: number;
  type: CellType;
  /** Cases suivantes : deux à un embranchement, une sinon, aucune à l'arrivée. */
  next: number[];
  /** Position sur le sol de la scène 3D. */
  x: number;
  z: number;
  /** Vrai si la case est sur un détour (chemin risqué). */
  detour?: boolean;
}

export interface BoardFork {
  /** Case où l'on choisit. */
  at: number;
  /** Première case du chemin principal et du détour. */
  main: number;
  detour: number;
  /** Case où les deux chemins se rejoignent. */
  rejoin: number;
  mainLength: number;
  detourLength: number;
}

export type BoardSize = "court" | "moyen" | "long" | "tres-long" | "marathon" | "perso";

export const BOARD_SIZES: Record<BoardSize, { label: string; cells: number }> = {
  court: { label: "Court", cells: 30 },
  moyen: { label: "Moyen", cells: 45 },
  long: { label: "Long", cells: 60 },
  "tres-long": { label: "Très long", cells: 80 },
  marathon: { label: "Marathon", cells: 100 },
  perso: { label: "Personnalisé", cells: 0 },
};

export interface Board {
  seed: number;
  size: BoardSize;
  cells: BoardCell[];
  start: number;
  finish: number;
  forks: BoardFork[];
}

/** Effets des cases, affichés dans l'interface. */
export const CELL_INFO: Record<CellType, { label: string; symbol: string; color: string; help: string }> = {
  depart: { label: "Départ", symbol: "D", color: "#FFFFFF", help: "Tout le monde part d'ici." },
  arrivee: { label: "Arrivée", symbol: "A", color: "#FFC83D", help: "Le premier arrivé gagne la partie." },
  vide: { label: "Case calme", symbol: "", color: "#F2E0B6", help: "Rien ne se passe." },
  bonus: { label: "Bonus", symbol: "+", color: "#2F7BEF", help: "Avance de 4 cases. La case où tu arrives ne s'active pas." },
  malus: { label: "Malus", symbol: "−", color: "#F0483E", help: "Recule de 4 cases. La case où tu arrives ne s'active pas." },
  piege: { label: "Piège", symbol: "!", color: "#9257E8", help: "Passe ton prochain tour." },
  boutique: { label: "Boutique", symbol: "$", color: "#F25FA8", help: "En passant ou en t'arrêtant ici, tu peux acheter des objets (2 au maximum)." },
  duel: { label: "Duel", symbol: "V", color: "#2DB866", help: "Défie l'adversaire de ton choix dans un mini-jeu : le gagnant prend des pièces au perdant." },
  ovni: { label: "OVNI", symbol: "U", color: "#18BDBD", help: "Effet imprévisible : téléportation, échange de place, pièces offertes ou volées." },
  evenement: { label: "Événement", symbol: "?", color: "#FF8A1F", help: "Un événement touche tout le monde : pluie de pièces, recul général, redistribution…" },
};

/** Cases dont l'effet existe déjà ; les autres arriveront avec les phases suivantes. */
export const ACTIVE_CELL_TYPES: CellType[] = ["vide", "bonus", "malus", "piege", "boutique", "duel", "ovni", "evenement"];

const SPACING = 1.7;
const ROW_GAP = 4.4;
const BONUS_STEPS = 4;
export const MALUS_STEPS = 4;
export { BONUS_STEPS };

type Weights = Partial<Record<CellType, number>>;
const DETOUR_WEIGHTS: Weights = { vide: 25, bonus: 38, malus: 15, piege: 22 };

function weighted(random: () => number, weights: Weights): CellType {
  const entries = Object.entries(weights).filter(([, w]) => (w ?? 0) > 0) as [CellType, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = random() * total;
  for (const [type, w] of entries) {
    roll -= w;
    if (roll < 0) return type;
  }
  return "vide";
}

export function generateBoard(seed: number, size: BoardSize = "moyen", custom?: BoardConfig): Board {
  const random = createRng(seed);
  const randInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const perso = size === "perso";
  const config = perso ? custom! : presetConfig(size);
  const total = config.length;
  const rowLength = total <= 45 ? 8 : total <= 80 ? 10 : total <= 300 ? 12 : 16;
  const MAIN_WEIGHTS: Weights = { ...config.weights };
  // Détours : plus de surprises sur les plateaux prédéfinis ; mêmes proportions en personnalisé.
  const DETOUR: Weights = perso ? { ...config.weights } : DETOUR_WEIGHTS;

  // 1. Chemin principal en serpentin : rangées de `rowLength` cases reliées par 2 cases de virage.
  const cells: BoardCell[] = [];
  const rowOf: { row: number; col: number }[] = [];
  let row = 0;
  let col = 0;
  let turning = 0;
  for (let i = 0; i < total; i++) {
    const leftToRight = row % 2 === 0;
    let x: number;
    let z: number;
    if (turning > 0) {
      x = (leftToRight ? rowLength - 1 : 0) * SPACING + (leftToRight ? 0.9 : -0.9);
      z = row * ROW_GAP + (turning === 2 ? ROW_GAP / 3 : (2 * ROW_GAP) / 3);
      rowOf.push({ row, col: -1 });
      turning--;
      if (turning === 0) {
        row++;
        col = 0;
      }
    } else {
      x = (leftToRight ? col : rowLength - 1 - col) * SPACING;
      z = row * ROW_GAP;
      rowOf.push({ row, col });
      col++;
      if (col === rowLength) turning = 2;
    }
    cells.push({ id: i, type: "vide", next: i + 1 < total ? [i + 1] : [], x, z });
  }
  const start = 0;
  const finish = total - 1;
  const lastRow = rowOf[finish]!.row;

  // 2. Détours : entre deux cases d'une même rangée, dans l'espace libre au-dessus ou en dessous.
  const forks: BoardFork[] = [];
  const gapUse = new Map<number, [number, number][]>(); // espace « entre la rangée g et g+1 » → intervalles de colonnes occupés
  const free = (gap: number, a: number, b: number) =>
    gap >= 0 && gap < lastRow && !(gapUse.get(gap) ?? []).some(([x0, x1]) => !(b + 1 < x0 || a - 1 > x1));
  const wanted = config.forks;
  const candidates = Array.from({ length: lastRow + 1 }, (_, r) => r).sort(() => random() - 0.5);
  let attempts = 0;
  while (forks.length < wanted && attempts < Math.max(60, wanted * 20)) {
    attempts++;
    const r = candidates[attempts % candidates.length]!;
    const span = randInt(3, 5);
    const fromCol = randInt(1, rowLength - 2 - span);
    const toCol = fromCol + span;
    const at = rowOf.findIndex((p) => p.row === r && p.col === fromCol);
    const rejoin = rowOf.findIndex((p) => p.row === r && p.col === toCol);
    if (rowLength - 2 - span < 1) continue;
    if (at < 1 || rejoin < 0 || rejoin >= finish || at + 1 > finish - 2) continue;
    if (forks.some((f) => f.at === at || f.rejoin === at || f.at === rejoin)) continue;
    // Colonnes réelles à l'écran (les rangées impaires vont de droite à gauche).
    const phys = (c: number) => (r % 2 === 0 ? c : rowLength - 1 - c);
    const lo = Math.min(phys(fromCol), phys(toCol));
    const hi = Math.max(phys(fromCol), phys(toCol));
    const gaps = [r, r - 1].filter((g) => free(g, lo, hi));
    if (!gaps.length) continue;
    const gap = gaps[Math.floor(random() * gaps.length)]!;
    gapUse.set(gap, [...(gapUse.get(gap) ?? []), [lo, hi]]);

    const direction = gap === r ? 1 : -1;
    const a = cells[at]!;
    const b = cells[rejoin]!;
    // Courbe en arche entre les deux cases, puis cases placées à intervalles réguliers le long de l'arche.
    const curve = (t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + direction * Math.sin(Math.PI * t) * ROW_GAP * 0.55 });
    const samples = Array.from({ length: 201 }, (_, i) => curve(i / 200));
    const along = [0];
    for (let i = 1; i < samples.length; i++) along.push(along[i - 1]! + Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z));
    const arc = along.at(-1)!;
    const length = Math.max(span + 1, Math.min(span + 3, Math.floor(arc / 1.15) - 1));
    const firstId = cells.length;
    for (let k = 1; k <= length; k++) {
      const target = (arc * k) / (length + 1);
      const i = along.findIndex((d) => d >= target);
      const p = samples[Math.max(0, i)]!;
      cells.push({ id: cells.length, type: "vide", next: [k < length ? cells.length + 1 : rejoin], x: p.x, z: p.z, detour: true });
    }
    a.next = [a.next[0]!, firstId];
    forks.push({ at, main: a.next[0]!, detour: firstId, rejoin, mainLength: rejoin - at, detourLength: length + 1 });
  }
  forks.sort((f, g) => f.at - g.at);

  // 3. Types de cases : calme près du départ et de l'arrivée, plus de surprises sur les détours.
  //    Variété garantie : jamais deux cases spéciales identiques à la suite, au plus 2 cases calmes d'affilée.
  const prevOf = new Map<number, number>();
  for (const cell of cells) for (const n of cell.next) if (!prevOf.has(n) || cells[n]!.detour) prevOf.set(n, cell.id);
  const typeAt = (id: number | undefined) => (id === undefined ? undefined : cells[id]!.type);
  for (const cell of cells) {
    if (cell.id === start) cell.type = "depart";
    else if (cell.id === finish) cell.type = "arrivee";
    else if (!cell.detour && (cell.id <= 2 || cell.id >= finish - 1)) cell.type = "vide";
    else {
      const p1 = prevOf.get(cell.id);
      const t1 = typeAt(p1);
      const t2 = typeAt(p1 === undefined ? undefined : prevOf.get(p1));
      const base: Weights = { ...(cell.detour ? DETOUR : MAIN_WEIGHTS) };
      const weights: Weights = { ...base };
      if (config.variety) {
        if (t1 && t1 !== "vide") delete weights[t1];
        if (t1 === "vide" && t2 === "vide") delete weights.vide;
        // Dernière case d'un détour : différente de la case où il rejoint la route.
        const after = cell.detour ? cells[cell.next[0]!] : undefined;
        if (after && !after.detour && after.type !== "vide") delete weights[after.type];
      }
      // Pas de case rouge juste après le départ : on ne recule pas avant d'avoir avancé.
      if (!cell.detour && cell.id <= config.malusSteps) delete weights.malus;
      // Si les règles de variété ne laissent plus rien (ex. « que des cases rouges »), on les ignore.
      const usable = Object.values(weights).some((w) => (w ?? 0) > 0) ? weights : base;
      cell.type = Object.values(usable).some((w) => (w ?? 0) > 0) ? weighted(random, usable) : "vide";
    }
  }

  for (const f of forks) if (cells[f.at]!.type === "boutique") cells[f.at]!.type = "vide";
  // Positions arrondies : un plateau de 2000 cases reste léger à envoyer sur le réseau.
  for (const c of cells) {
    c.x = Math.round(c.x * 100) / 100;
    c.z = Math.round(c.z * 100) / 100;
  }

  // 4. Plateaux prédéfinis : boutiques réparties régulièrement sur le chemin principal (jamais sur un embranchement).
  //    En personnalisé, elles sortent au hasard selon leur proportion.
  const shops = perso ? 0 : Math.max(2, Math.round(total / 15));
  for (let k = 1; k <= shops; k++) {
    let id = Math.round((total * k) / (shops + 1));
    while (id < finish - 2 && (forks.some((f) => f.at === id || f.rejoin === id) || cells[id]!.next.length > 1)) id++;
    if (id > 3 && id < finish - 2) cells[id]!.type = "boutique";
  }

  return { seed, size, cells, start, finish, forks };
}

/** Nombre minimal de cases à parcourir depuis chaque case jusqu'à l'arrivée. */
export function distancesToFinish(board: Board): number[] {
  const dist = board.cells.map(() => Infinity);
  dist[board.finish] = 0;
  // Graphe sans cycle et petit : on relâche jusqu'à stabilité.
  let changed = true;
  while (changed) {
    changed = false;
    for (const cell of board.cells) {
      for (const n of cell.next) {
        if (dist[n]! + 1 < dist[cell.id]!) {
          dist[cell.id] = dist[n]! + 1;
          changed = true;
        }
      }
    }
  }
  return dist;
}

/** Choix proposés à un embranchement, décrits pour le joueur. */
export function forkChoices(board: Board, cellId: number): { cell: number; label: string; length: number; detour: boolean }[] | null {
  const fork = board.forks.find((f) => f.at === cellId);
  if (!fork) return null;
  return [
    { cell: fork.main, label: "Chemin principal", length: fork.mainLength, detour: false },
    { cell: fork.detour, label: "Détour risqué", length: fork.detourLength, detour: true },
  ];
}
