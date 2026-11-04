import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "zappeur",
  name: "Zappeur fou",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 90,
  records: [{ key: "reflexe", label: "Meilleur réflexe au Zappeur fou", better: "lower", unit: "ms" }],
  rules: "La télé zappe toute seule d'une chaîne à l'autre. Appuie dès que la chaîne demandée apparaît : le plus rapide marque un point. Appuie sur une mauvaise chaîne et ta télécommande est bloquée jusqu'à la manche suivante ! 5 manches.",
};
