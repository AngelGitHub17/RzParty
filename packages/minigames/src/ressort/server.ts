import { defineTimingGame } from "../timing.ts";
import { definition } from "./definition.ts";
import { RESSORT_PEAKS, peakAt, ressortScore, type RessortParams } from "./logic.ts";

export default defineTimingGame<RessortParams>({
  definition,
  rounds: 3,
  readyMs: 2000,
  resultMs: 3000,
  params: (_, random) => ({ f0: 0.0005 + random() * 0.0002, accel: 1.1e-7 + random() * 0.5e-7 }),
  runMs: (p) => peakAt(RESSORT_PEAKS - 1, p) + 400,
  score: ressortScore,
  label: (t, score) => (t === null ? "Pas sauté" : score === 0 ? "Raté" : `${score} m`),
  total: "best",
  // Un bot vise le 3e ou 4e sommet.
  ideal: (p) => peakAt(3, p),
  botSpread: 45,
  record: "hauteur",
});
