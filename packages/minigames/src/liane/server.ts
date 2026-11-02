import { defineTimingGame } from "../timing.ts";
import { definition } from "./definition.ts";
import { lianeScore, type LianeParams } from "./logic.ts";

export default defineTimingGame<LianeParams>({
  definition,
  rounds: 3,
  readyMs: 2000,
  resultMs: 3000,
  params: (round, random) => ({ period: 2300 - round * 200 + Math.floor(random() * 300) }),
  runMs: (p) => p.period * 4,
  score: lianeScore,
  label: (t, score) => (t === null ? "Pas lâché" : score === 0 ? "Plouf !" : `${score} m`),
  total: "best",
  ideal: (p) => p.period + p.period / 8,
  botSpread: 130,
  record: "metres",
});
