/** Générateur pseudo-aléatoire reproductible (mulberry32) : même graine, même suite. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entier entre min et max inclus. */
export function randInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** Élément au hasard d'une liste non vide. */
export function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)]!;
}

/** Valeur suivant à peu près une loi normale (moyenne, écart-type). */
export function gaussian(random: () => number, mean: number, deviation: number): number {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Copie mélangée d'une liste (mélange de Fisher-Yates, équitable). */
export function shuffled<T>(random: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
