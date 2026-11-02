import { defineTimingGame } from "../timing.ts";
import { definition } from "./definition.ts";
import { photoScore, type PhotoParams } from "./logic.ts";

export default defineTimingGame<PhotoParams>({
  definition,
  rounds: 3,
  readyMs: 2000,
  resultMs: 3000,
  params: (round, random) => {
    const length = 8000;
    const peakAt = 2200 + random() * 4800;
    const fakes = Array.from({ length: 2 + round }, () => ({ at: 800 + random() * 6600, height: 45 + random() * 25 })).filter((f) => Math.abs(f.at - peakAt) > 700);
    return { peakAt, width: 300 - round * 40, fakes, length };
  },
  runMs: (p) => p.length,
  score: photoScore,
  label: (t, score) => (t === null ? "Pas de photo" : `Sourire ${score} %`),
  total: "sum",
  ideal: (p) => p.peakAt,
  botSpread: 170,
  record: "sourire",
});
