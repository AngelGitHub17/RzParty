import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "labyrinthe",
  name: "Labyrinthe",
  category: "labyrinthe",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 60,
  records: [{ key: "temps", label: "Sortie du labyrinthe", better: "lower", unit: "s" }],
  rules: "Tout le monde est dans le même labyrinthe. Guide ton pion jusqu'à la sortie avec les flèches (ou le clavier). Le premier sorti gagne ; à la fin du temps, les plus proches de la sortie passent devant.",
};
