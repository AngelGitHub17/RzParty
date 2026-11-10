import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "alunissage",
  name: "Alunissage",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 100,
  records: [{ key: "atterrissage", label: "Meilleur alunissage", better: "higher", unit: "pts" }],
  rules: "Ta capsule tombe vers la Lune. Maintiens le bouton MOTEUR (ou la barre Espace) pour freiner, lâche pour tomber. Garde la jauge de vitesse dans le vert : « Freine ! » s'affiche quand tu vas trop vite. Pose-toi à moins de 5 m/s pour ne pas t'écraser ; plus c'est doux, plus ça rapporte. 2 essais, le meilleur compte.",
};
