import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@rzparty/shared";
import { artificeScore, landingAt, rocketHeight } from "@rzparty/minigames/src/artifice/logic.ts";
import escargots from "@rzparty/minigames/src/escargots/server.ts";
import { SNAIL_GOAL, SNAIL_READY_MS, SNAIL_TIRED_MS } from "@rzparty/minigames/src/escargots/types.ts";
import { MiniGameRunner } from "../src/game/MiniGameRunner.ts";

describe("fournée 5", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Feu d'artifice : 100 au sommet, moins à côté, pétard mouillé au sol", () => {
    const p = { peak: 2000, height: 0.8, color: 0 };
    expect(rocketHeight(p.peak, p)).toBeCloseTo(0.8);
    expect(rocketHeight(0, p)).toBe(0);
    expect(rocketHeight(landingAt(p), p)).toBe(0);
    expect(artificeScore(p.peak, p)).toBe(100);
    expect(artificeScore(p.peak - 300, p)).toBe(artificeScore(p.peak + 300, p));
    expect(artificeScore(p.peak - 300, p)).toBeLessThan(100);
    expect(artificeScore(landingAt(p), p)).toBe(0);
    expect(artificeScore(null, p)).toBe(0);
  });

  it("Course d'escargots : chaque appui fait avancer, trop vite = essoufflé", async () => {
    const states: any[] = [];
    let ranking: string[][] | undefined;
    const runner = new MiniGameRunner({
      module: escargots,
      players: [{ id: "a", name: "A", color: 0 }, { id: "b", name: "B", color: 1 }],
      bots: new Map(),
      random: createRng(3),
      now: () => Date.now(),
      publish: (s) => states.push(s),
      sendTo: () => {},
    });
    void runner.result.then((r) => (ranking = r.ranking));
    runner.start();
    await vi.advanceTimersByTimeAsync(SNAIL_READY_MS + 10);
    // B tapote trop vite : 9 appuis dans la seconde → essoufflé.
    runner.input("b", { taps: 6 });
    runner.input("b", { taps: 3 });
    await vi.advanceTimersByTimeAsync(200);
    expect(states.at(-1).tiredUntil.b).toBeGreaterThan(Date.now());
    runner.input("b", { taps: 1 });
    await vi.advanceTimersByTimeAsync(200);
    expect(states.at(-1).progress.b).toBe(6);
    await vi.advanceTimersByTimeAsync(SNAIL_TIRED_MS);
    // A tapote 7 fois par seconde jusqu'à la salade.
    for (let k = 0; k < SNAIL_GOAL; k++) {
      runner.input("a", { taps: 1 });
      await vi.advanceTimersByTimeAsync(143);
    }
    expect(states.at(-1).finished.a).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(ranking?.[0]).toEqual(["a"]);
  }, 30_000);
});
