import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "liane",
  name: "Liane folle",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 50,
  records: [{ key: "metres", label: "Plus long vol en Liane folle", better: "higher", unit: "m" }],
  rules: "Tu te balances au bout d'une liane au-dessus de la rivière. Lâche-la quand elle part vers l'avant, à mi-hauteur, pour voler le plus loin possible. Trop tôt ou trop tard : plouf ! 3 essais, le meilleur compte.",
};
