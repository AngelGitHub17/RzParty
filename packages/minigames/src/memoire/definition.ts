import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "memoire",
  name: "Mémo-flash",
  category: "memoire",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 300,
  records: [{ key: "niveau", label: "Niveau atteint en Mémo-flash", better: "higher" }],
  rules: "Mémorise ce qui s'affiche : une suite de couleurs, de formes ou de chiffres à refaire dans l'ordre, ou une rangée d'objets où il faudra trouver celui qui a disparu. Ça se corse à chaque niveau, et une erreur t'élimine.",
};
