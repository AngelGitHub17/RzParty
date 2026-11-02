import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "tremplin",
  name: "Grand tremplin",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 40,
  records: [{ key: "metres", label: "Plus long saut au Grand tremplin", better: "higher", unit: "m" }],
  rules: "Le skieur prend de la vitesse : appuie pour sauter le plus tard possible, juste avant le bout du tremplin. Trop tard, c'est la chute ! 3 sauts, le plus long compte.",
};
