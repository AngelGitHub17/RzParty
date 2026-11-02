import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "visage",
  name: "Où est-il ?",
  category: "memoire",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 80,
  records: [{ key: "trouves", label: "Personnages retrouvés en une manche", better: "higher" }],
  rules: "Mémorise le personnage, puis retrouve-le parmi les sosies ! Le plus rapide marque 3 points, le suivant 2, les autres 1. Une erreur : 0 pour cette manche. 5 manches.",
};
