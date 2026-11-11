import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "escargots",
  name: "Course d'escargots",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 35,
  records: [{ key: "temps", label: "Course d'escargots la plus rapide", better: "lower", unit: "s" }],
  rules: "Tapote pour faire avancer ton escargot jusqu'à la salade ! Mais pas trop vite : au-delà de 8 appuis par seconde, il s'essouffle et s'arrête un moment. Trouve le bon rythme !",
};
