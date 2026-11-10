import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ILE_GATES, ILE_LAST_CELL, ILE_SUMMIT, clampForward, createRng, generateIsland, ileBonusForPlace, ileLayout, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { IleGame } from "../src/game/modes/ile.ts";
import type { Room } from "../src/rooms/Room.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup(seed: number, bots = 3) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["survie", "ile"] as GameModeId[]);
  const seat = manager.createIndividualRoom("chef", "Chef");
  const kinds = ["agressif", "glitch", "equilibre"] as const;
  for (let i = 0; i < bots; i++) manager.addBot("chef", kinds[i % 3]!);
  manager.updateSettings("chef", { mode: "ile" });
  const room = manager.startGame("chef", (r: Room) =>
    new IleGame({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, random: createRng(seed), now: () => Date.now() }),
  );
  manager.watchRoom("tv", seat.code);
  return { manager, room };
}

describe("mode Île aux défis", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("l'île : 72 cases, 6 défis, cases bien placées, spirale lisible", () => {
    for (const seed of [1, 2, 3, 42]) {
      const cells = generateIsland(seed);
      expect(cells).toHaveLength(ILE_LAST_CELL + 1);
      expect(cells[0]).toBe("depart");
      expect(cells.filter((c) => c === "statue-bleue")).toHaveLength(1);
      expect(cells.filter((c) => c === "crane")).toHaveLength(2);
      expect(cells.indexOf("statue-rouge")).toBeGreaterThanOrEqual(24);
      for (const g of ILE_GATES) expect(cells[g.after]).toBe("vide");
      expect(cells.join(",")).not.toMatch(/(vide,){4}/);
    }
    expect(ILE_GATES.map((g) => g.after)).toEqual([5, 21, 38, 45, 55, 71]);
    const layout = ileLayout();
    expect(layout).toHaveLength(ILE_SUMMIT + 1);
    for (let i = 1; i < layout.length; i++) expect(Math.hypot(layout[i]!.x - layout[i - 1]!.x, layout[i]!.y - layout[i - 1]!.y)).toBeGreaterThan(36);
    expect([0, 1, 2, 3].map((p) => ileBonusForPlace(p, 4))).toEqual([6, 3, 2, null]);
    // Un effet qui fait avancer s'arrête devant le défi suivant (sauf le mur du dragon brisé).
    expect(clampForward(18, 30, false)).toBe(21);
    expect(clampForward(18, 30, true)).toBe(30);
    expect(clampForward(60, 80, false)).toBe(71);
  });

  for (const seed of [3, 7, 11, 19]) {
    it(`une partie de bots va jusqu'au sommet, défis tentés, dés bonus distribués (graine ${seed})`, async () => {
      const { manager, room } = setup(seed);
      manager.disconnect("chef");
      const kinds = new Set<string>();
      let rolls = 0;
      let bonusSeen = false;
      let volcano = false;
      let lastRoll: unknown = null;
      for (let t = 0; t < 30000 && room.game!.snapshot().stage !== "podium"; t++) {
        await vi.advanceTimersByTimeAsync(500);
        const s = room.game!.snapshot().ile!;
        const turn = s.turn;
        if (turn?.roll && turn.roll !== lastRoll && JSON.stringify(turn.roll) !== JSON.stringify(lastRoll)) {
          lastRoll = turn.roll;
          rolls++;
          if (turn.roll.bonus !== null) {
            bonusSeen = true;
            expect(turn.roll.bonus).toBeLessThanOrEqual(turn.roll.bonusMax!);
          }
          if (turn.roll.extra !== null) expect(turn.roll.bonus).toBe(turn.roll.std);
        }
        if (turn?.challenge) kinds.add(ILE_GATES[turn.challenge.gate]!.kind);
        for (const p of Object.values(s.pawns)) {
          expect(p.cell).toBeGreaterThanOrEqual(0);
          expect(p.cell).toBeLessThanOrEqual(ILE_SUMMIT);
          if (p.volcano !== null) volcano = true;
        }
      }
      const snap = room.game!.snapshot();
      expect(snap.stage).toBe("podium");
      expect(snap.winners).toHaveLength(1);
      // Le gagnant a brisé la statue du sommet.
      expect(snap.ile!.pawns[snap.winners[0]!]!.cell).toBe(ILE_SUMMIT);
      expect(rolls).toBeGreaterThan(10);
      expect(bonusSeen).toBe(true);
      expect(kinds.has("liane")).toBe(true);
      expect(kinds.has("final")).toBe(true);
      expect(kinds.size).toBeGreaterThanOrEqual(5);
      void volcano;
    }, 240_000);
  }

  it("le joueur humain lance ses dés et choisit son chemin sur la cascade", async () => {
    let chosePath = false;
    for (const seed of [2, 5, 9, 14, 21]) {
      const { manager, room } = setup(seed, 2);
      const me = room.players.find((p) => !p.isBot)!.id;
      let refused = false;
      for (let t = 0; t < 30000 && room.game!.snapshot().stage !== "podium" && !chosePath; t++) {
        await vi.advanceTimersByTimeAsync(250);
        const snap = room.game!.snapshot();
        if (snap.stage === "intro") manager.gameReady("chef");
        const turn = snap.ile?.turn;
        if (snap.stage !== "ile" || !turn) continue;
        if (turn.playerId !== me && turn.phase === "roll" && !refused) {
          expect(() => manager.gameAction("chef", { type: "roll" })).toThrow();
          refused = true;
        }
        if (turn.playerId !== me) continue;
        if (turn.phase === "roll") manager.gameAction("chef", { type: "roll" });
        else if (turn.choose?.kind === "chemin") {
          expect(() => manager.gameAction("chef", { type: "path", option: 3 })).toThrow();
          manager.gameAction("chef", { type: "path", option: 1 });
          expect(room.game!.snapshot().ile!.turn!.challenge!.choice).toBe(1);
          chosePath = true;
        } else if (turn.choose?.kind === "duel") manager.gameAction("chef", { type: "duel", target: turn.choose.options[0]! });
      }
      room.game!.dispose();
      if (chosePath) break;
    }
    expect(chosePath).toBe(true);
  }, 240_000);
});
