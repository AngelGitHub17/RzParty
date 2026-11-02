import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "chrono",
  name: "Chrono à l'aveugle",
  category: "reflexes",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 70,
  records: [{ key: "ecart", label: "Plus petit écart au Chrono à l'aveugle", better: "lower", unit: "ms" }],
  rules: "Un chrono démarre puis devient invisible. Arrête-le le plus près possible du temps demandé ! 3 manches : le plus petit écart total gagne.",
};
