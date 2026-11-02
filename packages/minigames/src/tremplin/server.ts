import { defineTimingGame } from "../timing.ts";
import { definition } from "./definition.ts";
import { tremplinScore, type TremplinParams } from "./logic.ts";

export default defineTimingGame<TremplinParams>({
  definition,
  rounds: 3,
  readyMs: 2000,
  resultMs: 3000,
  params: (_, random) => ({ ramp: 2200 + Math.floor(random() * 1200) }),
  runMs: (p) => p.ramp + 1200,
  score: tremplinScore,
  label: (t, score) => (t === null ? "Pas sauté" : score === 0 ? "Chute !" : `${score} m`),
  total: "best",
  ideal: (p) => p.ramp - 90,
  botSpread: 160,
  record: "metres",
});
