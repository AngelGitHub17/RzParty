import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "cadeaux",
  name: "Tour de cadeaux",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 70,
  records: [{ key: "etages", label: "Plus haute tour de cadeaux", better: "higher" }],
  rules: "Un cadeau se balance au-dessus de ta pile : lâche-le pile au-dessus ! Ce qui dépasse tombe, et ton prochain cadeau sera plus petit. Raté complètement, ta tour s'arrête là. La plus haute tour gagne.",
};
