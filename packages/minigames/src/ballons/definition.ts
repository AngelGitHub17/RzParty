import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "ballons",
  name: "Ballons volants",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 45,
  records: [{ key: "ballons", label: "Ballons éclatés", better: "higher" }],
  rules: "Des ballons s'envolent : éclate seulement ceux de la couleur demandée (+1). Une mauvaise couleur te coûte un point, et la couleur change souvent ! Le ballon doré vaut 3 points. 30 secondes.",
};
