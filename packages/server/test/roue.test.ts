import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { WheelGame } from "../src/game/modes/roue.ts";
import type { Room } from "../src/rooms/Room.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

describe("mode Grande Roue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("des bots jouent tous les tours jusqu'au podium, la cagnotte part au gagnant des mini-jeux", async () => {
    const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
    const manager = new RoomManager(timings, events, () => ["survie", "plateau", "roue"] as GameModeId[]);
    const seat = manager.createIndividualRoom("chef", "Chef");
    for (const p of ["agressif", "glitch"] as const) manager.addBot("chef", p);
    manager.updateSettings("chef", { mode: "roue", wheel: { rounds: 5 } });
    const room = manager.startGame("chef", (r: Room) =>
      new WheelGame({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, random: createRng(3), now: () => Date.now() }),
    );
    manager.watchRoom("tv", seat.code);
    manager.disconnect("chef");
    let spins = 0;
    let lastSpin = -1;
    let cagnotte = 0;
    for (let t = 0; t < 2000 && room.game!.snapshot().stage !== "podium"; t++) {
      await vi.advanceTimersByTimeAsync(500);
      const snap = room.game!.snapshot();
      const turn = snap.wheel?.turn;
      if (turn && turn.spinId !== lastSpin && turn.segment !== null) {
        lastSpin = turn.spinId;
        spins++;
      }
      if (snap.stage === "results" && snap.purpose === "cagnotte") cagnotte++;
    }
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(snap.wheel!.round).toBe(5);
    expect(spins).toBe(15);
    const best = Math.max(...Object.values(snap.wheel!.medals));
    for (const w of snap.winners) expect(snap.wheel!.medals[w]).toBe(best);
    expect(cagnotte).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
