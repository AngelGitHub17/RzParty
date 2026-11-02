import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@rzparty/shared";
import piratage from "@rzparty/minigames/src/piratage/server.ts";
import { allCodes, isValidGuess, score } from "@rzparty/minigames/src/piratage/types.ts";
import labyrinthe from "@rzparty/minigames/src/labyrinthe/server.ts";
import { DIRS, OPEN, distances, type Dir } from "@rzparty/minigames/src/labyrinthe/types.ts";
import bombe from "@rzparty/minigames/src/bombe/server.ts";
import { MiniGameRunner } from "../src/game/MiniGameRunner.ts";

const players = [{ id: "a", name: "A", color: 0 }, { id: "b", name: "B", color: 1 }];

function run(module: any) {
  const states: any[] = [];
  const priv: Record<string, any[]> = { a: [], b: [] };
  let ranking: string[][] | undefined;
  let records: any;
  const runner = new MiniGameRunner({
    module,
    players,
    bots: new Map(),
    random: createRng(7),
    now: () => Date.now(),
    publish: (s) => states.push(s),
    sendTo: (id, d) => priv[id]!.push(d),
  });
  void runner.result.then((r) => ((ranking = r.ranking), (records = r.records)));
  runner.start();
  return { runner, states, priv, get ranking() { return ranking; }, get records() { return records; } };
}

describe("nouveaux mini-jeux", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Piratage : indices justes, codes invalides refusés, le premier qui trouve gagne", async () => {
    expect(allCodes()).toHaveLength(360);
    expect(score("1234", "1243")).toEqual({ exact: 2, near: 2 });
    expect(score("1234", "5612")).toEqual({ exact: 0, near: 2 });
    expect(isValidGuess("1123")).toBe(false);
    expect(isValidGuess("1237")).toBe(false);
    const g = run(piratage);
    // On retrouve le code en essayant tout (côté test) via les indices.
    g.runner.input("b", { guess: "9999" }); // ignoré
    await vi.advanceTimersByTimeAsync(10);
    expect(g.states.at(-1).progress.b.tries).toBe(0);
    let candidates = allCodes();
    for (let i = 0; i < 10 && g.ranking === undefined; i++) {
      const guess = candidates[0]!;
      g.runner.input("a", { guess });
      const fb = g.priv.a!.at(-1).guesses.at(-1).feedback;
      if (fb.exact === 4) break;
      candidates = candidates.filter((c) => {
        const f = score(c, guess);
        return f.exact === fb.exact && f.near === fb.near;
      });
    }
    expect(g.states.at(-1).progress.a.cracked).toBe(true);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(g.ranking![0]).toEqual(["a"]);
    expect(g.records.a.essais).toBeGreaterThan(0);
    expect(g.states.at(-1).code).toMatch(/^[1-6]{4}$/);
  });

  it("Labyrinthe : les murs bloquent, le plus court chemin mène à la sortie", async () => {
    const g = run(labyrinthe);
    await vi.advanceTimersByTimeAsync(10);
    const s = g.states.at(-1);
    const dist: number[] = distances(s.cells, s.size, s.exit);
    expect(dist.every((d: number) => Number.isFinite(d))).toBe(true);
    // Un pas dans un mur est ignoré.
    const blocked = (Object.keys(DIRS) as Dir[]).find((d) => !(s.cells[0] & OPEN[d]))!;
    g.runner.input("b", { dir: blocked });
    await vi.advanceTimersByTimeAsync(100);
    expect(g.states.at(-1).positions.b).toEqual({ x: 0, y: 0 });
    let pos = { x: 0, y: 0 };
    while (pos.x !== s.exit.x || pos.y !== s.exit.y) {
      const here = pos.y * s.size + pos.x;
      const dir = (Object.keys(DIRS) as Dir[]).find((d) => s.cells[here] & OPEN[d] && dist[(pos.y + DIRS[d][1]) * s.size + pos.x + DIRS[d][0]]! < dist[here]!)!;
      g.runner.input("a", { dir });
      pos = { x: pos.x + DIRS[dir][0], y: pos.y + DIRS[dir][1] };
      await vi.advanceTimersByTimeAsync(80);
    }
    expect(g.states.at(-1).arrived).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(g.ranking).toEqual([["a"], ["b"]]);
  });

  it("Patate explosive : seul le porteur peut taper, le mot complet passe la bombe, l'explosion élimine", async () => {
    const g = run(bombe);
    await vi.advanceTimersByTimeAsync(1300);
    let s = g.states.at(-1);
    expect(s.holder).not.toBeNull();
    const holder = s.holder as string;
    const other = holder === "a" ? "b" : "a";
    g.runner.input(other, { pass: s.pass, letter: 0 });
    expect(g.states.at(-1).progress).toBe(0);
    for (const c of s.word as string) g.runner.input(holder, { pass: s.pass, letter: s.letters.indexOf(c) });
    s = g.states.at(-1);
    expect(s.holder).toBe(other);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(g.ranking).toEqual([[holder], [other]]);
  });
});
