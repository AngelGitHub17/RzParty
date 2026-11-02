import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "vaetvient",
  name: "Va-et-vient",
  category: "memoire",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 110,
  records: [{ key: "points", label: "Points au Va-et-vient", better: "higher" }],
  rules: "Des personnages entrent et sortent de la maison. Compte bien ! À la fin, combien sont à l'intérieur ? Réponse exacte : 3 points, à un près : 1 point. 3 manches.",
};
