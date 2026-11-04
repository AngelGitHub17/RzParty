import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@rzparty/shared";
import zappeur from "@rzparty/minigames/src/zappeur/server.ts";
import penalty from "@rzparty/minigames/src/penalty/server.ts";
import { gauge, shotOutcome } from "@rzparty/minigames/src/penalty/types.ts";
import alunissage from "@rzparty/minigames/src/alunissage/server.ts";
import { landingScore, simulate } from "@rzparty/minigames/src/alunissage/types.ts";
import ballons from "@rzparty/minigames/src/ballons/server.ts";
import { MiniGameRunner } from "../src/game/MiniGameRunner.ts";

const players = [{ id: "a", name: "A", color: 0 }, { id: "b", name: "B", color: 1 }];

function run(module: any) {
  const states: any[] = [];
  let ranking: string[][] | undefined;
  const runner = new MiniGameRunner({ module, players, bots: new Map(), random: createRng(3), now: () => Date.now(), publish: (s) => states.push(s), sendTo: () => {} });
  void runner.result.then((r) => (ranking = r.ranking));
  runner.start();
  return { runner, states, get ranking() { return ranking; } };
}

describe("fournée 3", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Zappeur fou : mauvaise chaîne = bloqué, la bonne chaîne marque", async () => {
    const g = run(zappeur);
    await vi.advanceTimersByTimeAsync(2300);
    let s = g.states.at(-1);
    expect(s.phase).toBe("zap");
    expect(s.zap.channel).not.toBe(s.target);
    g.runner.input("b", { round: 1, zap: s.zapIndex, dt: 300 });
    expect(g.states.at(-1).locked).toEqual(["b"]);
    for (let i = 0; i < 100 && g.states.at(-1).zap?.channel !== g.states.at(-1).target; i++) await vi.advanceTimersByTimeAsync(50);
    s = g.states.at(-1);
    expect(s.zap.channel).toBe(s.target);
    await vi.advanceTimersByTimeAsync(200);
    g.runner.input("a", { round: 1, zap: s.zapIndex, dt: 5 }); // trop rapide : ramené à 80 ms minimum
    await vi.advanceTimersByTimeAsync(400);
    s = g.states.at(-1);
    expect(s.phase).toBe("result");
    expect(s.winner).toBe("a");
    expect(s.times.a).toBe(80);
  });

  it("Tirs au but : jauge et règles du tir", async () => {
    expect(gauge(0)).toBe(0);
    expect(gauge(700)).toBeCloseTo(1);
    expect(shotOutcome(0.76, 0, 0)).toBe("but"); // zone dorée : imparable
    expect(shotOutcome(0.6, 2, 2)).toBe("arret");
    expect(shotOutcome(0.6, 2, 0)).toBe("but");
    expect(shotOutcome(0.4, 1, 0)).toBe("arret"); // tir mou rattrapé
    expect(shotOutcome(0.97, 1, 0)).toBe("dessus");
    expect(shotOutcome(null, null, 0)).toBe("rate");
    const g = run(penalty);
    await vi.advanceTimersByTimeAsync(10);
    g.runner.input("a", { shot: 1, dir: 0, t: 99_999 }); // temps impossible : refusé
    expect(g.states.at(-1).shot_done).toEqual([]);
    await vi.advanceTimersByTimeAsync(532);
    g.runner.input("a", { shot: 1, dir: 0, t: 532 });
    await vi.advanceTimersByTimeAsync(6000);
    const s = g.states.at(-1);
    expect(s.results.a.outcome).toBe("but");
    expect(s.results.b.outcome).toBe("rate");
    expect(s.goals).toEqual({ a: 1, b: 0 });
  });

  it("Alunissage : physique identique partout, commandes futures refusées", async () => {
    const free = simulate([], 60_000);
    expect(free.landedAt).not.toBeNull();
    expect(landingScore(free)).toBe(0);
    const g = run(alunissage);
    await vi.advanceTimersByTimeAsync(2600);
    expect(g.states.at(-1).phase).toBe("fly");
    g.runner.input("a", { round: 1, toggles: [5000] }); // dans le futur
    await vi.advanceTimersByTimeAsync(300);
    expect(g.states.at(-1).toggles.a).toEqual([]);
    g.runner.input("a", { round: 1, toggles: [300] });
    await vi.advanceTimersByTimeAsync(300);
    expect(g.states.at(-1).toggles.a).toEqual([300]);
    g.runner.input("a", { round: 1, toggles: [200, 600] }); // réécrire le passé : refusé
    await vi.advanceTimersByTimeAsync(300);
    expect(g.states.at(-1).toggles.a).toEqual([300]);
    await vi.advanceTimersByTimeAsync(33_000);
    const s = g.states.at(-1);
    expect(s.landed.b.crashed).toBe(true);
    expect(s.phase).toBe("result");
  });

  it("Ballons volants : bonne couleur +1, mauvaise −1, pas deux fois le même", async () => {
    const g = run(ballons);
    let s: any;
    for (let i = 0; i < 200; i++) {
      await vi.advanceTimersByTimeAsync(100);
      s = g.states.at(-1);
      if (s.balloons.some((b: any) => b.color === s.target) && s.balloons.some((b: any) => b.color >= 0 && b.color !== s.target)) break;
    }
    const good = s.balloons.find((b: any) => b.color === s.target);
    const bad = s.balloons.find((b: any) => b.color >= 0 && b.color !== s.target);
    g.runner.input("a", { balloon: good.id });
    g.runner.input("a", { balloon: good.id });
    expect(g.states.at(-1).scores.a).toBe(1);
    g.runner.input("a", { balloon: bad.id });
    expect(g.states.at(-1).scores.a).toBe(0);
  });
});
