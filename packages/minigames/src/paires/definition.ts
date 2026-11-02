import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "paires",
  name: "Paires de fruits",
  category: "memoire",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 75,
  records: [{ key: "coups", label: "Paires de fruits terminées en", better: "lower", unit: "coups" }],
  rules: "Retourne les cartes deux par deux pour retrouver les 8 paires de fruits. Tout le monde a le même jeu ! Le premier qui trouve toutes les paires gagne.",
};
