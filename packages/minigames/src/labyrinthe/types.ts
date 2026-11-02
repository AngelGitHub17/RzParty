/** Données échangées par le mini-jeu « Labyrinthe ». */

export const LABY_DURATION_MS = 45_000;
export const LABY_SIZE = 9;
/** Délai minimal entre deux pas d'un même joueur (évite les rafales de touches). */
export const MIN_STEP_MS = 70;

export type Dir = "haut" | "bas" | "gauche" | "droite";
export const DIRS: Record<Dir, [number, number]> = { haut: [0, -1], bas: [0, 1], gauche: [-1, 0], droite: [1, 0] };
/** Bits des murs ouverts d'une cellule. */
export const OPEN: Record<Dir, number> = { haut: 1, droite: 2, bas: 4, gauche: 8 };

export interface LabyState {
  size: number;
  /** Pour chaque cellule (ligne par ligne), les passages ouverts (bits OPEN). */
  cells: number[];
  exit: { x: number; y: number };
  positions: Record<string, { x: number; y: number }>;
  /** Ordre d'arrivée. */
  arrived: string[];
  endsAt: number;
  finished: boolean;
}

export interface LabyInput {
  dir: Dir;
}

/** Labyrinthe parfait (un seul chemin entre deux cellules) par exploration en profondeur. */
export function makeMaze(random: () => number, size: number): number[] {
  const cells = new Array<number>(size * size).fill(0);
  const seen = new Array<boolean>(size * size).fill(false);
  const stack: [number, number][] = [[0, 0]];
  seen[0] = true;
  const opposite: Record<Dir, Dir> = { haut: "bas", bas: "haut", gauche: "droite", droite: "gauche" };
  while (stack.length) {
    const [x, y] = stack.at(-1)!;
    const options = (Object.keys(DIRS) as Dir[]).filter((d) => {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      return nx >= 0 && ny >= 0 && nx < size && ny < size && !seen[ny * size + nx];
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const d = options[Math.floor(random() * options.length)]!;
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
    cells[y * size + x]! |= OPEN[d];
    cells[ny * size + nx]! |= OPEN[opposite[d]];
    seen[ny * size + nx] = true;
    stack.push([nx, ny]);
  }
  // Quelques passages en plus : plusieurs chemins possibles, moins de culs-de-sac frustrants.
  for (let i = 0; i < size; i++) {
    const x = Math.floor(random() * (size - 1));
    const y = Math.floor(random() * size);
    cells[y * size + x]! |= OPEN.droite;
    cells[y * size + x + 1]! |= OPEN.gauche;
  }
  return cells;
}

/** Distance (en pas) de chaque cellule jusqu'à la sortie. */
export function distances(cells: number[], size: number, exit: { x: number; y: number }): number[] {
  const dist = new Array<number>(size * size).fill(Infinity);
  const queue = [exit.y * size + exit.x];
  dist[queue[0]!] = 0;
  while (queue.length) {
    const i = queue.shift()!;
    const x = i % size, y = Math.floor(i / size);
    for (const d of Object.keys(DIRS) as Dir[]) {
      if (!(cells[i]! & OPEN[d])) continue;
      const j = (y + DIRS[d][1]) * size + x + DIRS[d][0];
      if (dist[j]! > dist[i]! + 1) {
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}
