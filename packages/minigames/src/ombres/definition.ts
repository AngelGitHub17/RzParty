import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "ombres",
  name: "Ombres chinoises",
  category: "logique",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 66,
  records: [],
  rules: "Une ombre se dessine sur le mur : à quoi appartient-elle ? Touche la bonne image parmi les quatre. Le plus rapide marque 3 points, les autres bonnes réponses 1 point. Une erreur et tu attends la manche suivante ! 7 ombres.",
};
