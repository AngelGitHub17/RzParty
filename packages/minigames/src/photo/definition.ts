import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "photo",
  name: "Photo souvenir",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 55,
  records: [{ key: "sourire", label: "Total de sourires en Photo souvenir", better: "higher", unit: "%" }],
  rules: "Le modèle grimace, fait semblant… puis sourit pour de vrai, très brièvement. Prends LA photo au moment du plus grand sourire ! Une seule photo par manche, 3 manches.",
};
