import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "reflexes",
  name: "Dégaine !",
  category: "reflexes",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 45,
  records: [{ key: "reaction", label: "Meilleur réflexe", better: "lower", unit: "ms" }],
  rules: "Attends le signal, puis appuie le plus vite possible. Trois manches : le temps total le plus court gagne. Un appui trop tôt coûte cher !",
};
