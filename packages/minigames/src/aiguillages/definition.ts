import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "aiguillages",
  name: "Aiguillages",
  category: "logique",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 120,
  records: [{ key: "trains", label: "Trains arrivés à bon port aux Aiguillages", better: "higher" }],
  rules: "Suis les rails des yeux, puis règle les 3 aiguillages (en haut ou en bas) pour que le train arrive à la gare demandée. Bonne gare : 1 point, et 1 point de plus pour le plus rapide ! 6 trains.",
};
