import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng, type BotPersonality, type Difficulty } from "@rzparty/shared";
import { MINI_GAMES, type BotProfile } from "@rzparty/minigames/server";
import reflexes from "@rzparty/minigames/src/reflexes/server.ts";
import { MiniGameRunner, normalizeRanking } from "../src/game/MiniGameRunner.ts";

const personalities: BotPersonality[] = ["equilibre", "agressif", "lent-precis", "glitch"];

function runWithBots(moduleIndex: number, count: number, difficulty: Difficulty, seed: number) {
  const module = MINI_GAMES[moduleIndex]!;
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: i }));
  const bots = new Map<string, BotProfile>(players.map((p, i) => [p.id, { personality: personalities[i % 4]!, difficulty }]));
  const random = createRng(seed);
  const runner = new MiniGameRunner({ module, players, bots, random, now: () => Date.now(), publish: () => {}, sendTo: () => {} });
  runner.start();
  return runner;
}

describe("mini-jeux joués par des bots", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  for (const [index, module] of MINI_GAMES.entries()) {
    for (const difficulty of ["facile", "moyen", "difficile"] as Difficulty[]) {
      it(`${module.definition.name} (${difficulty}) se termine avec un classement complet`, async () => {
        const runner = runWithBots(index, 5, difficulty, 42 + index);
        let ranking: string[][] | undefined;
        void runner.result.then((r) => (ranking = r.ranking));
        await vi.advanceTimersByTimeAsync(module.definition.durationSec * 1000 - 1);
        expect(ranking, "le mini-jeu doit finir avant son filet de sécurité").toBeDefined();
        expect(ranking!.flat().sort()).toEqual(["p0", "p1", "p2", "p3", "p4"]);
      });
    }
  }
});

describe("Dégaine ! côté serveur", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pénalise le faux départ et refuse les temps impossibles", async () => {
    const states: any[] = [];
    let ranking: string[][] | undefined;
    const players = [{ id: "a", name: "A", color: 0 }, { id: "b", name: "B", color: 1 }, { id: "c", name: "C", color: 2 }];
    const runner = new MiniGameRunner({
      module: reflexes as any,
      players,
      bots: new Map(),
      random: createRng(1),
      now: () => Date.now(),
      publish: (s) => states.push(s),
      sendTo: () => {},
    });
    let records: any;
    void runner.result.then((r) => ((ranking = r.ranking), (records = r.records)));
    runner.start();

    for (let turn = 1; turn <= 3; turn++) {
      runner.input("c", { kind: "tap", signal: 0 }); // c appuie toujours trop tôt
      let go: any;
      for (let t = 0; t < 600 && !go; t++) {
        await vi.advanceTimersByTimeAsync(10);
        go = states.findLast((s: any) => s.phase === "go" && s.turn === turn);
      }
      expect(go).toBeDefined();
      await vi.advanceTimersByTimeAsync(250);
      runner.input("a", { kind: "tap", signal: go.signal, reactionMs: 240 });
      runner.input("b", { kind: "tap", signal: go.signal, reactionMs: 20 }); // impossible : traité comme anticipation
      await vi.advanceTimersByTimeAsync(3000);
    }
    await vi.advanceTimersByTimeAsync(5000);
    const last = states.at(-1);
    expect(last.outcomes.c[0]).toEqual({ kind: "false-start" });
    expect(last.outcomes.b[0]).toEqual({ kind: "false-start" });
    expect(last.outcomes.a[0].kind).toBe("time");
    expect(ranking![0]).toEqual(["a"]);
    expect(records.a.reaction).toBeGreaterThanOrEqual(100);
    expect(records.c).toBeUndefined();
  });

  it("normalise un classement incomplet", () => {
    expect(normalizeRanking([["b", "x"], ["b"], []], ["a", "b", "c"])).toEqual([["b"], ["a", "c"]]);
  });
});
