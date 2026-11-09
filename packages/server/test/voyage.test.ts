import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBE_MAP, GLOBE_SIZE, createRng, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { GlobeGame, ringDistance, walk } from "../src/game/modes/voyage.ts";
import type { Room } from "../src/rooms/Room.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup(seed: number, rounds: number, bots: number) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["survie", "voyage"] as GameModeId[]);
  const seat = manager.createIndividualRoom("chef", "Chef");
  const kinds = ["agressif", "glitch", "equilibre"] as const;
  for (let i = 0; i < bots; i++) manager.addBot("chef", kinds[i % 3]!);
  manager.updateSettings("chef", { mode: "voyage", voyage: { rounds } });
  const room = manager.startGame("chef", (r: Room) =>
    new GlobeGame({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, random: createRng(seed), now: () => Date.now() }),
  );
  manager.watchRoom("tv", seat.code);
  return { manager, room };
}

describe("mode Tour du monde", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("une boucle autour du monde : 12 destinations, 3 aéroports, 3 ports", () => {
    expect(GLOBE_MAP.filter((s) => s.kind === "destination")).toHaveLength(12);
    expect(GLOBE_MAP.filter((s) => s.kind === "aeroport")).toHaveLength(3);
    expect(GLOBE_MAP.filter((s) => s.kind === "port")).toHaveLength(3);
    expect(GLOBE_MAP[0]!.kind).toBe("depart");
    for (const s of GLOBE_MAP) expect(s.x).toBeGreaterThanOrEqual(0), expect(s.x).toBeLessThanOrEqual(1000);
    expect(walk(GLOBE_SIZE - 1, 2, 1)).toEqual([0, 1]);
    expect(walk(1, 2, -1)).toEqual([0, GLOBE_SIZE - 1]);
    expect(ringDistance(0, GLOBE_SIZE - 1)).toBe(1);
  });

  for (const [seed, rounds, bots] of [[3, 6, 3], [11, 6, 1], [17, 10, 2]] as const) {
    it(`des bots voyagent jusqu'au podium (graine ${seed}, ${rounds} tours, ${bots + 1} joueurs)`, async () => {
      const { manager, room } = setup(seed, rounds, bots);
      manager.disconnect("chef");
      let photos = 0;
      for (let t = 0; t < 12000 && room.game!.snapshot().stage !== "podium"; t++) {
        await vi.advanceTimersByTimeAsync(500);
        const g = room.game!.snapshot().globe!;
        for (const c of Object.values(g.coins)) expect(c).toBeGreaterThanOrEqual(0);
        for (const h of Object.values(g.hands)) expect(h.length).toBeLessThanOrEqual(4);
        expect(g.hotspots.length).toBeGreaterThan(0);
        photos = Object.values(g.photos).reduce((s, p) => s + p.length, 0);
      }
      const snap = room.game!.snapshot();
      expect(snap.stage).toBe("podium");
      expect(photos).toBeGreaterThan(0);
      const g = snap.globe!;
      const score = (id: string) => g.photos[id]!.length * 10000 + g.coins[id]!;
      const best = Math.max(...Object.keys(g.photos).map(score));
      for (const w of snap.winners) expect(score(w)).toBe(best);
    }, 180_000);
  }

  it("un humain joue ses cartes, refusées hors de son tour ou invalides", async () => {
    const { manager, room } = setup(5, 6, 1);
    const me = room.players.find((p) => !p.isBot)!.id;
    let played = 0;
    for (let t = 0; t < 6000 && played < 3 && room.game!.snapshot().stage !== "podium"; t++) {
      await vi.advanceTimersByTimeAsync(250);
      const snap = room.game!.snapshot();
      if (snap.stage === "intro") manager.gameReady("chef");
      const g = snap.globe!;
      const turn = g.turn;
      if (snap.stage !== "globe" || !turn?.choice) continue;
      if (turn.playerId !== me) {
        expect(() => manager.gameAction("chef", { type: "card", index: 0, dir: 1 })).toThrow();
        continue;
      }
      if (turn.choice.type === "card") {
        const hand = g.hands[me]!;
        expect(() => manager.gameAction("chef", { type: "card", index: 99, dir: 1 })).toThrow();
        const i = hand.findIndex((c) => c.kind === "train" || c.kind === "helico");
        const pos = g.positions[me]!;
        if (i >= 0) {
          manager.gameAction("chef", { type: "card", index: i, dir: 1 });
          const after = room.game!.snapshot().globe!;
          expect(after.positions[me]).toBe((pos + (hand[i]!.value ?? 8)) % GLOBE_SIZE);
          expect(after.hands[me]).toHaveLength(hand.length - 1);
        } else if (!hand.length) manager.gameAction("chef", { type: "card", index: null, dir: -1 });
        else continue;
        played++;
      } else if (turn.choice.type === "shop") manager.gameAction("chef", { type: "shop", index: null });
      else if (turn.choice.type === "airport" || turn.choice.type === "port") manager.gameAction("chef", { type: "travel", space: null });
    }
    expect(played).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
