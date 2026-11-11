import { defineTimingGame } from "../timing.ts";
import { definition } from "./definition.ts";
import { ARTIFICE_COLORS, artificeScore, landingAt, type ArtificeParams } from "./logic.ts";

export default defineTimingGame<ArtificeParams>({
  definition,
  rounds: 3,
  readyMs: 1800,
  resultMs: 2800,
  params: (round, random) => ({
    peak: 1400 + Math.floor(random() * 1100),
    height: 0.65 + random() * 0.33,
    color: (round + Math.floor(random() * ARTIFICE_COLORS.length)) % ARTIFICE_COLORS.length,
  }),
  runMs: (p) => landingAt(p) + 300,
  score: artificeScore,
  label: (t, score) => (t === null || score === 0 ? "Pétard mouillé…" : score >= 95 ? `Splendide ! ${score} pts` : `${score} pts`),
  total: "sum",
  ideal: (p) => p.peak,
  botSpread: 170,
  record: "eclat",
});
