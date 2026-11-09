import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBE_MAP, createRng, globeDistances, globeReachable, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { GlobeGame } from "../src/game/modes/voyage.ts";
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

  it("un réseau autour du monde : 12 destinations, 3 aéroports, des embranchements", () => {
    expect(GLOBE_MAP.filter((s) => s.kind === "destination")).toHaveLength(12);
    expect(GLOBE_MAP.filter((s) => s.kind === "aeroport")).toHaveLength(3);
    expect(GLOBE_MAP[0]!.kind).toBe("depart");
    // Tout est relié, dans les deux sens, et il y a des carrefours.
    expect(globeDistances(0).every((d) => Number.isFinite(d))).toBe(true);
    for (const s of GLOBE_MAP) for (const n of s.next) expect(GLOBE_MAP[n]!.next).toContain(s.id);
    expect(GLOBE_MAP.filter((s) => s.next.length >= 3).length).toBeGreaterThanOrEqual(8);
    // Les cases ne se chevauchent pas sur la carte.
    for (const a of GLOBE_MAP) for (const b of GLOBE_MAP) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(30);
    // Arrivées à exactement N cases, chemins sans retour en arrière.
    for (const n of [1, 2, 3, 6]) {
      const reach = globeReachable(0, n);
      expect(reach.size).toBeGreaterThanOrEqual(2);
      for (const [end, path] of reach) {
        expect(path).toHaveLength(n);
        expect(path.at(-1)).toBe(end);
        expect(new Set(path).size).toBe(n);
      }
    }
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
        expect(() => manager.gameAction("chef", { type: "draw", slot: 0 })).toThrow();
        continue;
      }
      if (turn.choice.type === "card") {
        expect(() => manager.gameAction("chef", { type: "draw", slot: 9 })).toThrow();
        manager.gameAction("chef", { type: "draw", slot: 2 });
        expect(room.game!.snapshot().globe!.turn!.reveal?.slot).toBe(2);
        played++;
      } else if (turn.choice.type === "move") {
        const pos = g.positions[me]!;
        const target = turn.choice.options.at(-1)!;
        expect(() => manager.gameAction("chef", { type: "move", space: pos })).toThrow();
        manager.gameAction("chef", { type: "move", space: target });
        expect(room.game!.snapshot().globe!.positions[me]).toBe(target);
        expect(globeDistances(pos)[target]).toBeLessThanOrEqual(turn.choice.steps);
      } else if (turn.choice.type === "shop") manager.gameAction("chef", { type: "shop", index: null });
      else if (turn.choice.type === "airport" || turn.choice.type === "port") manager.gameAction("chef", { type: "travel", space: null });
    }
    expect(played).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
