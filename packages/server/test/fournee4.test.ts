import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@rzparty/shared";
import { peakAt, ressortScore, spring } from "@rzparty/minigames/src/ressort/logic.ts";
import { makeCard } from "@rzparty/minigames/src/puzzle/types.ts";
import puzzle from "@rzparty/minigames/src/puzzle/server.ts";
import { JUMP_MS, makeHurdles, simulateRun, STEP_MS } from "@rzparty/minigames/src/haies/types.ts";
import aiguillages from "@rzparty/minigames/src/aiguillages/server.ts";
import { exitOf } from "@rzparty/minigames/src/aiguillages/types.ts";
import { MiniGameRunner } from "../src/game/MiniGameRunner.ts";

const players = [{ id: "a", name: "A", color: 0 }, { id: "b", name: "B", color: 1 }];
function run(module: any) {
  const states: any[] = [];
  const priv: Record<string, any[]> = { a: [], b: [] };
  let ranking: string[][] | undefined;
  const runner = new MiniGameRunner({ module, players, bots: new Map(), random: createRng(5), now: () => Date.now(), publish: (s) => states.push(s), sendTo: (id, d) => priv[id]!.push(d) });
  void runner.result.then((r) => (ranking = r.ranking));
  runner.start();
  return { runner, states, priv, get ranking() { return ranking; } };
}

describe("fournée 4", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Ressort : sommets justes, l'élan récompense l'attente", () => {
    const p = { f0: 0.0006, accel: 1.3e-7 };
    for (let k = 0; k < 5; k++) expect(spring(peakAt(k, p), p)).toBeCloseTo(1, 5);
    expect(ressortScore(peakAt(0, p), p)).toBe(100);
    expect(ressortScore(peakAt(4, p), p)).toBe(148);
    expect(ressortScore(peakAt(0, p) + 400, p)).toBeLessThan(40);
    expect(ressortScore(null, p)).toBe(0);
  });

  it("Puzzle express : une seule bonne moitié, les pièges diffèrent d'une bande", () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i++) {
      const { card, answer } = makeCard(i, rng);
      const same = card.choices.map((c) => JSON.stringify(c) === JSON.stringify(card.left));
      expect(same.filter(Boolean)).toHaveLength(1);
      expect(same[answer]).toBe(true);
      for (const c of card.choices) {
        const diffs = c.filter((b, j) => b.shape !== card.left[j]!.shape || b.color !== card.left[j]!.color).length;
        expect(diffs).toBeLessThanOrEqual(1);
      }
    }
  });

  it("Puzzle express : bonne réponse = puzzle suivant, erreur = main bloquée", async () => {
    const g = run(puzzle);
    await vi.advanceTimersByTimeAsync(10);
    const card = g.priv.a!.at(-1).card;
    const answer = card.choices.findIndex((c: any) => JSON.stringify(c) === JSON.stringify(card.left));
    g.runner.input("a", { index: 0, choice: (answer + 1) % 4 });
    expect(g.states.at(-1).solved.a).toBe(0);
    g.runner.input("a", { index: 0, choice: answer }); // bloqué : ignoré
    expect(g.states.at(-1).solved.a).toBe(0);
    await vi.advanceTimersByTimeAsync(1600);
    g.runner.input("a", { index: 0, choice: answer });
    expect(g.states.at(-1).solved.a).toBe(1);
    expect(g.priv.a!.at(-1).card.index).toBe(1);
    // Les deux joueurs ont le même premier puzzle.
    expect(g.priv.b![0].card).toEqual(card);
  });

  it("Course de haies : sauts parfaits sans faute, sans saut toutes les haies tombent", () => {
    const hurdles = makeHurdles(createRng(4));
    const none = simulateRun(hurdles, [], 60_000);
    expect(none.hit).toHaveLength(hurdles.length);
    const jumps: number[] = [];
    hurdles.forEach((_, i) => {
      const c = simulateRun(hurdles, jumps, 60_000).cross[i]!;
      jumps.push(Math.round((c - JUMP_MS / 2) / STEP_MS) * STEP_MS);
    });
    const clean = simulateRun(hurdles, jumps, 60_000);
    expect(clean.hit).toEqual([]);
    expect(clean.finishedAt!).toBeLessThan(none.finishedAt!);
  });

  it("Aiguillages : le chemin mène à la bonne gare, le plus rapide gagne 2 points", async () => {
    expect(exitOf([0, 0, 0])).toBe(0);
    expect(exitOf([1, 0, 1])).toBe(5);
    const g = run(aiguillages);
    await vi.advanceTimersByTimeAsync(1900);
    const s = g.states.at(-1);
    expect(s.phase).toBe("choose");
    const exit = s.wiring.indexOf(s.target);
    const path = [(exit >> 2) & 1, (exit >> 1) & 1, exit & 1];
    g.runner.input("a", { round: 1, path: [9, 0, 0], t: 500 }); // invalide
    expect(g.states.at(-1).answered).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    g.runner.input("b", { round: 1, path, t: 1000 });
    g.runner.input("a", { round: 1, path: path.map((b) => 1 - b), t: 600 });
    await vi.advanceTimersByTimeAsync(500);
    const r = g.states.at(-1);
    expect(r.phase).toBe("result");
    expect(r.scores).toEqual({ a: 0, b: 2 });
    expect(r.results.b.fastest).toBe(true);
  });
});
