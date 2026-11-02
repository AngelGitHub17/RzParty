/** Données échangées par le mini-jeu « Calcul express ». */

export const CALCUL_DURATION_MS = 35_000;

export interface CalculState {
  /** Fin de la manche, en temps serveur. */
  endsAt: number;
  /** Bonnes réponses et réponses données par joueur. */
  progress: Record<string, { score: number; answered: number }>;
  finished: boolean;
}

/** Envoyé à chaque joueur : sa question en cours et le verdict de sa réponse précédente. */
export interface CalculPrivate {
  index: number;
  question: string;
  last: "juste" | "faux" | null;
}

export interface CalculInput {
  index: number;
  answer: number;
}

export interface CalculQuestion {
  text: string;
  answer: number;
}

/**
 * Génère la question n°`index` : on monte doucement en difficulté, sans jamais dépasser
 * les tables de multiplication jusqu'à 9 ni des résultats au-delà de 100.
 */
export function makeQuestion(random: () => number, index: number): CalculQuestion {
  const r = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  if (index < 5) {
    const a = r(1, 10), b = r(1, 10);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (index < 10) {
    if (random() < 0.5) {
      const a = r(6, 20), b = r(1, a - 1);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    const a = r(5, 25), b = r(2, 15);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (index < 16) {
    const a = r(2, 5), b = r(2, 10);
    return random() < 0.5 ? { text: `${a} × ${b}`, answer: a * b } : { text: `${b} × ${a}`, answer: a * b };
  }
  const kind = r(0, 2);
  if (kind === 0) {
    const a = r(3, 9), b = r(3, 9);
    return { text: `${a} × ${b}`, answer: a * b };
  }
  if (kind === 1) {
    const a = r(20, 60), b = r(5, 35);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  const a = r(20, 60), b = r(5, a - 5);
  return { text: `${a} − ${b}`, answer: a - b };
}
