import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "tri",
  name: "Tri éclair",
  category: "logique",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 55,
  records: [{ key: "series", label: "Séries triées en une manche", better: "higher" }],
  rules: "Touche les nombres du plus petit au plus grand. Une erreur et la série recommence ! Le premier à finir les 8 séries gagne.",
};
