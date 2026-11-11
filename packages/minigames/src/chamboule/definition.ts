import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "chamboule",
  name: "Chamboule-tout",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 40,
  records: [{ key: "boites", label: "Meilleur score au Chamboule-tout", better: "higher", unit: "pts" }],
  rules: "Le viseur va et vient devant la pyramide de boîtes : lance la balle quand il passe pile au milieu de la pyramide ! Plus tu vises juste, plus tu en fais tomber. 6 boîtes d'un coup : +4 points bonus. 3 lancers.",
};
