import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "pas",
  name: "Pas comptés",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 60,
  rules: "Le marcheur avance d'un pas régulier. Au bout de quelques pas, tout devient invisible : continue de compter dans ta tête et appuie sur STOP au nombre de pas demandé ! 3 manches.",
};
