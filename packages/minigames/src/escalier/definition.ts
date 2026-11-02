import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "escalier",
  name: "Escalier secret",
  category: "logique",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 120,
  rules: "À chaque manche, choisis en secret de monter de 1, 2 ou 3 marches. Mais si quelqu'un d'autre a choisi le même nombre que toi, aucun de vous deux n'avance ! Le premier en haut des 12 marches gagne.",
};
