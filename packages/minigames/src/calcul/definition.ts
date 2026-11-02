import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "calcul",
  name: "Calcul express",
  category: "calcul",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 50,
  records: [{ key: "bonnes", label: "Calculs justes en une manche", better: "higher" }],
  rules: "Résous un maximum de calculs avant la fin du temps. Une erreur ne coûte rien, mais tu passes au calcul suivant sans marquer de point.",
};
