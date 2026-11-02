import { defineTimingGame } from "../timing.ts";
import { definition } from "./definition.ts";
import { pasScore, type PasParams } from "./logic.ts";

export default defineTimingGame<PasParams>({
  definition,
  rounds: 3,
  readyMs: 2200,
  resultMs: 3200,
  params: (round, random) => ({ pace: 420 + Math.floor(random() * 230), target: 10 + round * 3 + Math.floor(random() * 4), visible: 5 }),
  runMs: (p) => (p.target + 8) * p.pace,
  score: pasScore,
  label: (t, score, p) => (t === null ? "Pas arrêté" : `${(t / p.pace).toFixed(1).replace(".", ",")} pas · ${score} pts`),
  total: "sum",
  ideal: (p) => p.target * p.pace,
  botSpread: 600,
});
