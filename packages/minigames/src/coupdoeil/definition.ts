import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "coupdoeil",
  name: "Coup d'œil",
  category: "memoire",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 75,
  records: [{ key: "points", label: "Points en Coup d'œil", better: "higher" }],
  rules: "Des formes s'affichent quelques secondes, puis disparaissent. Combien y avait-il de la forme demandée ? Réponse exacte : 3 points, à un près : 1 point. 4 manches.",
};
