import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "alunissage",
  name: "Alunissage",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 100,
  records: [{ key: "atterrissage", label: "Meilleur alunissage", better: "higher", unit: "pts" }],
  rules: "Ta capsule tombe vers la Lune : maintiens le bouton (ou la barre Espace) pour allumer le moteur et freiner. Touche le sol le plus doucement possible, sans gaspiller le carburant. Trop vite, c'est le crash ! 2 essais, le meilleur compte.",
};
