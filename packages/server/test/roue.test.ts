import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WHEEL_PHASES, createRng, wheelPhase, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { WheelGame } from "../src/game/modes/roue.ts";
import type { Room } from "../src/rooms/Room.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup(seed: number, rounds: number, bots: number) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["survie", "plateau", "roue"] as GameModeId[]);
  const seat = manager.createIndividualRoom("chef", "Chef");
  const kinds = ["agressif", "glitch", "equilibre"] as const;
  for (let i = 0; i < bots; i++) manager.addBot("chef", kinds[i % 3]!);
  manager.updateSettings("chef", { mode: "roue", wheel: { rounds } });
  const room = manager.startGame("chef", (r: Room) =>
    new WheelGame({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, random: createRng(seed), now: () => Date.now() }),
  );
  manager.watchRoom("tv", seat.code);
  return { manager, room };
}

describe("mode Grande Roue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("4 roues de 22 cases, composées comme prévu", () => {
    expect(WHEEL_PHASES).toHaveLength(4);
    for (const w of WHEEL_PHASES) expect(w).toHaveLength(22);
    const count = (p: number, kind: string, value?: number) => WHEEL_PHASES[p]!.filter((s) => s.kind === kind && (value === undefined || s.value === value)).length;
    expect(count(0, "banque", 500)).toBe(8);
    expect(count(0, "perte")).toBe(3);
    expect(count(1, "chance")).toBe(1);
    expect(count(2, "duel")).toBe(3);
    expect(count(3, "bataille4")).toBe(4);
    expect(count(3, "multi")).toBe(0);
    const w0 = WHEEL_PHASES[0]!;
    const same = w0.filter((s, i) => s.label === w0[(i + 1) % 22]!.label).length;
    expect(same).toBeLessThanOrEqual(3);
    expect([1, 4, 5, 7, 8, 10, 11].map((r) => wheelPhase(r, 10))).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });

  for (const [seed, rounds, bots] of [[3, 5, 3], [8, 10, 2], [21, 5, 1]] as const) {
    it(`des bots jouent jusqu'au podium (graine ${seed}, ${rounds} tours, ${bots + 1} joueurs), médailles jamais négatives`, async () => {
      const { manager, room } = setup(seed, rounds, bots);
      manager.disconnect("chef");
      let spins = 0;
      let lastSpin = -1;
      let overtime = 0;
      for (let t = 0; t < 8000 && room.game!.snapshot().stage !== "podium"; t++) {
        await vi.advanceTimersByTimeAsync(500);
        const w = room.game!.snapshot().wheel!;
        for (const m of Object.values(w.medals)) expect(m).toBeGreaterThanOrEqual(0);
        expect(w.pot).toBeGreaterThanOrEqual(0);
        expect(w.pot).toBeLessThanOrEqual(99_999);
        overtime = Math.max(overtime, w.overtime);
        const turn = w.turn;
        if (turn && turn.spinId !== lastSpin && turn.segment !== null) {
          lastSpin = turn.spinId;
          spins++;
        }
      }
      const snap = room.game!.snapshot();
      expect(snap.stage).toBe("podium");
      expect(spins).toBeGreaterThanOrEqual(rounds * (bots + 1));
      const best = Math.max(...Object.values(snap.wheel!.medals));
      for (const w of snap.winners) expect(snap.wheel!.medals[w]).toBe(best);
      expect(overtime).toBeGreaterThanOrEqual(1);
    }, 120_000);
  }

  it("Duel : le lanceur humain choisit son adversaire", async () => {
    let dueled = false;
    for (const seed of [5, 6, 7, 9, 12]) {
      const { manager, room } = setup(seed, 10, 2);
      const me = room.players.find((p) => !p.isBot)!.id;
      for (let t = 0; t < 8000 && !dueled && room.game!.snapshot().stage !== "podium"; t++) {
        await vi.advanceTimersByTimeAsync(250);
        const snap = room.game!.snapshot();
        const turn = snap.wheel!.turn;
        if (snap.stage === "intro") manager.gameReady("chef");
        if (snap.stage === "wheel" && turn?.playerId === me && turn.phase === "spin") manager.gameAction("chef", { type: "spin" });
        if (snap.stage === "wheel" && turn?.phase === "choose" && turn.chooser === me) {
          const target = turn.options![0]!.id;
          expect(() => manager.gameAction("chef", { type: "duel", target: "personne" })).toThrow();
          manager.gameAction("chef", { type: "duel", target });
          expect(room.game!.snapshot().wheel!.battle).toMatchObject({ kind: "duel", solo: me, opponent: target });
          dueled = true;
        }
      }
      room.game!.dispose();
      if (dueled) break;
    }
    expect(dueled).toBe(true);
  }, 240_000);
});
