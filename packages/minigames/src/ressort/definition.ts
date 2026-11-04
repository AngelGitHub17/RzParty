import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "ressort",
  name: "Ressort",
  category: "reflexes",
  formats: ["chacun", "1v1"],
  players: { min: 2, max: 8 },
  durationSec: 60,
  records: [{ key: "hauteur", label: "Plus haut saut au Ressort", better: "higher", unit: "m" }],
  rules: "Le ressort rebondit de plus en plus vite, et chaque rebond donne plus d'élan. Appuie quand la jauge est tout en haut pour t'envoler : attendre rapporte plus, mais vise juste ! 3 sauts, le plus haut compte.",
};
