import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "perles",
  name: "Chasse aux perles",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 45,
  records: [{ key: "perles", label: "Perles ramassées", better: "higher" }],
  rules: "Les huîtres s'ouvrent et se referment : attrape la perle quand l'huître est ouverte (perle dorée : 3 points). Attention au crabe caché (−1), et ne te fais pas pincer quand elle se referme : ta main sera bloquée ! 30 secondes.",
};
