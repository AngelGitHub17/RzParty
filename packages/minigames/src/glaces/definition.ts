import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "glaces",
  name: "Cornet glacé",
  category: "memoire",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 70,
  records: [],
  rules: "Un client commande un cornet : mémorise les boules dans l'ordre, de bas en haut ! Puis refais-le de mémoire. Bon cornet le plus vite : 3 points, puis 2, puis 1. Une boule de plus à chaque commande.",
};
