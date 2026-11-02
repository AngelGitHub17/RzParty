import type { MiniGameDefinition } from "../contract.ts";

export const definition: MiniGameDefinition = {
  id: "taupes",
  name: "Tape-taupe",
  category: "reflexes",
  formats: ["chacun"],
  players: { min: 2, max: 8 },
  durationSec: 45,
  records: [{ key: "taupes", label: "Taupes tapées en une manche", better: "higher" }],
  rules: "Des taupes sortent des trous, les mêmes pour tout le monde. Tape-les avant qu'elles ne replongent : +1 par taupe. Attention, taper un trou vide coûte 1 point !",
};
