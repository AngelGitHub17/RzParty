import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "puzzle",
  name: "Puzzle express",
  category: "logique",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 50,
  records: [{ key: "puzzles", label: "Puzzles réussis au Puzzle express", better: "higher" }],
  rules: "Chaque image est coupée en deux : trouve vite la moitié droite qui complète la gauche (mêmes formes, mêmes couleurs). Une erreur bloque ta main un court instant. Le plus de puzzles en 40 secondes gagne !",
};
