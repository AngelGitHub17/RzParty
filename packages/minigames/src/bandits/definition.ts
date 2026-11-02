import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "bandits",
  name: "Ruée vers l'Ouest",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 45,
  records: [{ key: "bandits", label: "Bandits touchés en une manche", better: "higher" }],
  rules: "Des silhouettes surgissent aux fenêtres du saloon, les mêmes pour tout le monde. Touche les bandits (+1) mais surtout pas les habitants (−3) !",
};
