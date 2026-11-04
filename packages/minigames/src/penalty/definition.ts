import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "penalty",
  name: "Tirs au but",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 90,
  records: [{ key: "buts", label: "Buts marqués aux Tirs au but", better: "higher" }],
  rules: "La jauge de puissance monte et descend : tire à gauche, au centre ou à droite quand elle est dans le vert. Trop faible, le gardien l'arrête plus facilement ; trop fort, c'est au-dessus ! En plein dans la zone dorée, c'est imparable. 5 tirs.",
};
