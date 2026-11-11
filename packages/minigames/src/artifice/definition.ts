import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "artifice",
  name: "Feu d'artifice",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 40,
  records: [{ key: "eclat", label: "Plus belle fusée au Feu d'artifice", better: "higher", unit: "pts" }],
  rules: "La fusée monte en ralentissant, s'arrête un instant tout en haut… puis retombe. Fais-la éclater pile au sommet ! Trop tôt ou trop tard, l'éclat est plus petit ; si elle touche le sol, c'est un pétard mouillé. 3 fusées, les points s'additionnent.",
};
