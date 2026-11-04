import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "haies",
  name: "Course de haies",
  category: "reflexes",
  formats: ["chacun", "1v1", "2v2", "4v4"],
  players: { min: 2, max: 8 },
  durationSec: 50,
  records: [{ key: "temps", label: "Meilleur temps à la Course de haies", better: "lower", unit: "s" }],
  rules: "Ton coureur file tout seul : appuie (ou barre Espace) pour sauter chaque haie. Trop tôt ou trop tard, tu la renverses et tu perds ton élan ! Premier arrivé au bout des 120 mètres.",
};
