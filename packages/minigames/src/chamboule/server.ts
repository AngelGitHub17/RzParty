import { defineTimingGame } from "../timing.ts";
import { definition } from "./definition.ts";
import { cansDown, chambouleScore, firstCenter, type ChambouleParams } from "./logic.ts";

export default defineTimingGame<ChambouleParams>({
  definition,
  rounds: 3,
  readyMs: 1800,
  resultMs: 2800,
  params: (round, random) => ({
    // De plus en plus rapide.
    period: Math.round(2400 - round * 350 + random() * 300),
    center: Math.round((random() - 0.5) * 100) / 100,
    sweeps: 3,
  }),
  runMs: (p) => p.period * p.sweeps,
  score: chambouleScore,
  label: (t, score, p) => {
    const n = cansDown(t, p);
    return t === null ? "Pas lancé" : n === 0 ? "Raté !" : n === 6 ? "Tout par terre ! +10" : `${n} boîte${n > 1 ? "s" : ""}`;
  },
  total: "sum",
  // Les bots visent le deuxième passage au centre (le premier arrive trop vite).
  ideal: (p) => firstCenter(p) + p.period,
  botSpread: 90,
  record: "boites",
});
