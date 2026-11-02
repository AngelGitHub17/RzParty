import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "stroop",
  name: "Couleurs piégées",
  category: "reflexes",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 50,
  records: [{ key: "justes", label: "Couleurs justes en une manche", better: "higher" }],
  rules: "Un mot de couleur s'affiche, écrit dans une autre couleur. Touche la couleur de l'ENCRE, pas celle du mot ! Une erreur te bloque une seconde.",
};
