import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@rzparty/shared";
import { artificeScore, landingAt, rocketHeight } from "@rzparty/minigames/src/artifice/logic.ts";
import escargots from "@rzparty/minigames/src/escargots/server.ts";
import { SNAIL_GOAL, SNAIL_READY_MS, SNAIL_TIRED_MS } from "@rzparty/minigames/src/escargots/types.ts";
import { aimAt, cansDown, chambouleScore, firstCenter } from "@rzparty/minigames/src/chamboule/logic.ts";
import glaces from "@rzparty/minigames/src/glaces/server.ts";
import ombres from "@rzparty/minigames/src/ombres/server.ts";
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

  it("Chamboule-tout : 6 boîtes pile au centre, aucune loin du centre", () => {
    for (const center of [-0.4, 0, 0.3]) {
      const p = { period: 2000, center, sweeps: 3 };
      const t = firstCenter(p);
      expect(aimAt(t, p)).toBeCloseTo(center, 5);
      expect(cansDown(t, p)).toBe(6);
      expect(chambouleScore(t, p)).toBe(10);
      expect(cansDown(null, p)).toBe(0);
    }
    const p = { period: 2000, center: 0.5, sweeps: 3 };
    // Viseur tout à gauche (-1) : rien ne tombe.
    expect(cansDown(1500, p)).toBe(0);
  });

  it("Cornet glacé et Ombres chinoises : bonne réponse = points, mauvaise = rien", async () => {
    for (const [module, answer] of [
      [glaces, (s: any) => ({ scoops: s.__order })],
      [ombres, (s: any) => ({ pick: s.choices.indexOf(s.shadow) })],
    ] as const) {
      const states: any[] = [];
      const runner = new MiniGameRunner({
        module: module as any,
        players: [{ id: "a", name: "A", color: 0 }, { id: "b", name: "B", color: 1 }],
        bots: new Map(),
        random: createRng(4),
        now: () => Date.now(),
        publish: (s) => states.push(s),
        sendTo: () => {},
      });
      runner.start();
      let order: number[] = [];
      let checked = false;
      for (let k = 0; k < 40; k++) {
        const s = states.at(-1);
        if (s.order) order = s.order;
        if ((s.phase === "build" || s.phase === "ask") && !s.correct.includes("a") && !s.wrong.includes("a")) {
          const good = answer({ ...s, __order: order });
          runner.input("a", { round: s.round, ...good });
          // B se trompe.
          runner.input("b", { round: s.round, ...(s.phase === "build" ? { scoops: [...order].reverse().map((f, i) => (i === 0 ? (f + 1) % 6 : f)) } : { pick: (good as any).pick === 0 ? 1 : 0 }) });
          const after = states.at(-1);
          expect(after.correct).toContain("a");
          expect(after.wrong).toContain("b");
          expect(after.scores.a).toBe(3);
          expect(after.scores.b).toBe(0);
          checked = true;
          break;
        }
        await vi.advanceTimersByTimeAsync(500);
      }
      expect(checked).toBe(true);
    }
  }, 30_000);
});
