import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "piratage",
  name: "Piratage",
  category: "logique",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 75,
  records: [{ key: "essais", label: "Code trouvé en", better: "lower", unit: "essais" }],
  rules:
    "Trouve le code secret de 4 chiffres (de 1 à 6, tous différents). Après chaque essai, chaque chiffre se colore : vert s'il est à la bonne place, orange s'il est dans le code mais ailleurs, gris s'il n'y est pas. Le premier qui trouve gagne.",
};
