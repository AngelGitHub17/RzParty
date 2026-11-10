import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "chrono",
  name: "Chrono à l'aveugle",
  category: "reflexes",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 70,
  records: [{ key: "ecart", label: "Plus petit écart au Chrono à l'aveugle", better: "lower", unit: "ms" }],
  rules: "Un temps est affiché (par exemple 5,50 s). Le chrono démarre, on le voit compter 3 secondes, puis il disparaît : continue de compter dans ta tête et appuie sur STOP quand tu penses être pile au temps demandé. 3 manches : le plus petit écart total gagne.",
};
