import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "bombe",
  name: "Patate explosive",
  category: "bombe",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 150,
  rules:
    "Une bombe passe de main en main. Si tu l'as, touche les lettres du mot dans l'ordre pour l'envoyer à quelqu'un d'autre. Personne ne sait quand elle explose ! Celui qui l'a à ce moment-là est éliminé. Le dernier debout gagne.",
};
