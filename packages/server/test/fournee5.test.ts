import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@rzparty/shared";
import perles from "@rzparty/minigames/src/perles/server.ts";
import cadeaux from "@rzparty/minigames/src/cadeaux/server.ts";
import { BASE, dropGift, giftCenter, giftSwing } from "@rzparty/minigames/src/cadeaux/types.ts";
import { MiniGameRunner } from "../src/game/MiniGameRunner.ts";

const players = [{ id: "a", name: "A", color: 0 }, { id: "b", name: "B", color: 1 }];
function run(module: any) {
  const states: any[] = [];
  const runner = new MiniGameRunner({ module, players, bots: new Map(), random: createRng(9), now: () => Date.now(), publish: (s) => states.push(s), sendTo: () => {} });
  runner.start();
  return { runner, states };
}

describe("fournée 5", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Chasse aux perles : perle +1, crabe −1, pincé si l'huître se referme", async () => {
    const g = run(perles);
    const find = async (kind: string) => {
      for (let i = 0; i < 400; i++) {
        await vi.advanceTimersByTimeAsync(20);
        const o = g.states.at(-1).openings.find((x: any) => x.treasure === kind && Date.now() - x.from < 100);
        if (o) return o;
      }
      throw new Error("introuvable");
    };
    const pearl = await find("perle");
    g.runner.input("a", { opening: pearl.id, dt: 50 });
    g.runner.input("a", { opening: pearl.id, dt: 60 }); // déjà prise
    expect(g.states.at(-1).scores.a).toBe(1);
    const crab = await find("crabe");
    g.runner.input("a", { opening: crab.id, dt: 50 });
    expect(g.states.at(-1).scores.a).toBe(0);
    const late = await find("perle");
    await vi.advanceTimersByTimeAsync(late.until - late.from - 120);
    g.runner.input("b", { opening: late.id, dt: late.until - late.from - 100 });
    expect(g.states.at(-1).pinched.b).toBeGreaterThan(Date.now());
    expect(g.states.at(-1).scores.b).toBe(0);
  });

  it("Tour de cadeaux : ce qui dépasse tombe, un lâcher parfait garde la largeur", async () => {
    expect(dropGift(BASE, 50.5, 40)).toEqual({ block: BASE, perfect: true });
    expect(dropGift(BASE, 60, 40)).toEqual({ block: [40, 70], perfect: false });
    expect(dropGift(BASE, 95, 40)).toBeNull();
    const g = run(cadeaux);
    await vi.advanceTimersByTimeAsync(600);
    // Lâcher quand le cadeau passe au centre : demi-période.
    const t = giftSwing(0).period / 2;
    expect(giftCenter(0, t)).toBeCloseTo(50, 5);
    await vi.advanceTimersByTimeAsync(t);
    g.runner.input("a", { gift: 0, t: 99_999 }); // impossible
    expect(g.states.at(-1).towers.a.blocks).toHaveLength(1);
    g.runner.input("a", { gift: 0, t: Math.round(t) });
    const tower = g.states.at(-1).towers.a;
    expect(tower.blocks).toHaveLength(2);
    expect(tower.perfect).toBe(1);
    // Sans rien faire, le cadeau de B tombe tout seul au bout de 7 s.
    await vi.advanceTimersByTimeAsync(7000);
    expect(g.states.at(-1).towers.b.blocks.length + (g.states.at(-1).towers.b.fell ? 1 : 0)).toBe(2);
  });
});
