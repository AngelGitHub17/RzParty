import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOAT_LIMIT, boatTorque, createRng, trioPoints, trioRowColor, trioRows, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { TriosGame } from "../src/game/modes/trios.ts";
import { BateauGame } from "../src/game/modes/bateau.ts";
import { PairesGame } from "../src/game/modes/paires.ts";
import { AmitieGame } from "../src/game/modes/amitie.ts";
import type { Room } from "../src/rooms/Room.ts";
import type { GameSession } from "../src/game/types.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup(make: (host: any) => GameSession, patch: object, seed = 9, bots = 3) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["survie", "trios", "bateau", "paires", "amitie"] as GameModeId[]);
  const seat = manager.createIndividualRoom("chef", "Chef");
  const kinds = ["agressif", "glitch", "equilibre"] as const;
  for (let i = 0; i < bots; i++) manager.addBot("chef", kinds[i % 3]!);
  manager.updateSettings("chef", patch);
  const room = manager.startGame("chef", (r: Room) =>
    make({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, random: createRng(seed), now: () => Date.now() }),
  );
  manager.watchRoom("tv", seat.code);
  return { manager, room };
}

async function untilPodium(room: Room, each?: () => void, steps = 8000) {
  for (let t = 0; t < steps && room.game!.snapshot().stage !== "podium"; t++) {
    await vi.advanceTimersByTimeAsync(500);
    each?.();
  }
}

describe("modes Trios, Bateau, Paires, Test d'amitié", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Trios : rangées et jokers", () => {
    expect(trioRowColor([1, 1, 1])).toBe(1);
    expect(trioRowColor([1, -1, 1])).toBe(1);
    expect(trioRowColor([-1, -1, -1])).toBe(-1);
    expect(trioRowColor([1, 2, 1])).toBeNull();
    expect(trioRowColor([1, null, 1])).toBeNull();
    expect(trioRows([0, 0, 0, 1, 1, 2])).toEqual([0]);
    expect(trioRows([0, 0, 0, 3, -1, 3])).toEqual([0, 1]);
    expect(trioPoints(1)).toBe(3);
    expect(trioPoints(2)).toBe(10);
  });

  for (const seed of [4, 13]) {
    it(`Trios : des bots jouent jusqu'au podium, le centre se vide et les couleurs cachées se révèlent (graine ${seed})`, async () => {
      const { manager, room } = setup((h) => new TriosGame(h), { mode: "trios", trios: { rounds: 4 } }, seed);
      const me = room.players.find((p) => !p.isBot)!.id;
      let mySwaps = 0;
      let refused = false;
      await untilPodium(room, () => {
        const t = room.game!.snapshot().trios!;
        for (const chars of Object.values(t.platforms)) {
          expect(chars).toHaveLength(6);
          // Sur les plateaux, toutes les couleurs sont visibles.
          for (const c of chars) expect(c.color).not.toBeNull();
        }
        if (t.turn && t.turn !== me && !refused) {
          expect(() => manager.gameAction("chef", { type: "trio", center: 0, slot: 0 })).toThrow();
          refused = true;
        }
        if (t.turn === me) {
          const c = t.center.findIndex((x) => x !== null);
          manager.gameAction("chef", { type: "trio", center: c, slot: mySwaps % 6 });
          mySwaps++;
        }
      });
      const snap = room.game!.snapshot();
      expect(snap.stage).toBe("podium");
      expect(snap.trios!.round).toBe(4);
      expect(mySwaps).toBeGreaterThanOrEqual(3);
      const best = Math.max(...Object.values(snap.trios!.scores));
      for (const w of snap.winners) expect(snap.trios!.scores[w]).toBe(best);
      for (const s of Object.values(snap.trios!.scores)) expect([0, 3, 6, 9, 10].some((n) => s % 1 === 0 && s >= 0 && (s === 0 || s >= n))).toBe(true);
    }, 120_000);
  }

  it("Bateau : penchant, places prises refusées, fin à l'objectif ou au chavirage", async () => {
    expect(boatTorque({ yard: 0, size: 3, slot: -4 })).toBeCloseTo(-11.2);
    expect(boatTorque({ yard: 2, size: 1, slot: 2 })).toBe(2);
    for (const seed of [2, 5, 8]) {
      const { manager, room } = setup((h) => new BateauGame(h), { mode: "bateau", bateau: { goal: 15 } }, seed);
      const me = room.players.find((p) => !p.isBot)!.id;
      let mine = 0;
      await untilPodium(room, () => {
        const b = room.game!.snapshot().bateau!;
        if (b.turn !== me) return;
        const cur = b.queue[0]!.sailor;
        const taken = b.sailors.find((s) => s.yard === cur.yard);
        if (taken) expect(() => manager.gameAction("chef", { type: "place", slot: taken.slot })).toThrow();
        const free = [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5].filter((slot) => !b.sailors.some((s) => s.yard === cur.yard && s.slot === slot));
        const best = free.sort((x, y) => Math.abs(b.tilt + boatTorque({ ...cur, slot: x })) - Math.abs(b.tilt + boatTorque({ ...cur, slot: y })))[0]!;
        manager.gameAction("chef", { type: "place", slot: best });
        mine++;
      });
      const snap = room.game!.snapshot();
      expect(snap.stage).toBe("podium");
      const b = snap.bateau!;
      expect(mine).toBeGreaterThan(0);
      if (b.phase === "won") {
        expect(b.sailors).toHaveLength(15);
        expect(snap.winners).toHaveLength(4);
        expect(Math.abs(b.tilt)).toBeLessThanOrEqual(BOAT_LIMIT);
      } else {
        expect(b.phase).toBe("sunk");
        expect(snap.winners).toHaveLength(0);
        expect(Math.abs(b.tilt)).toBeGreaterThan(BOAT_LIMIT);
      }
      // Jamais deux personnages à la même place.
      const places = b.sailors.map((s) => `${s.yard}:${s.slot}`);
      expect(new Set(places).size).toBe(places.length);
      room.game!.dispose();
    }
  }, 180_000);

  it("Paires : on retourne deux personnages, les paires trouvées comptent, la partie se termine", async () => {
    const { manager, room } = setup((h) => new PairesGame(h), { mode: "paires", paires: { tours: 6 } }, 7);
    const me = room.players.find((p) => !p.isBot)!.id;
    let flips = 0;
    let miniGames = 0;
    let lastStage = "";
    await untilPodium(room, () => {
      const snap = room.game!.snapshot();
      if (snap.stage === "intro" && lastStage !== "intro") miniGames++;
      lastStage = snap.stage;
      const s = snap.paires!;
      // Les couleurs cachées ne fuient jamais.
      s.cards.forEach((c, i) => {
        if (c.found === null && !s.flipped.includes(i)) expect(c.color).toBeNull();
      });
      if (s.turn === me && s.phase === "flip") {
        const i = s.cards.findIndex((c, k) => c.found === null && !s.flipped.includes(k));
        expect(() => manager.gameAction("chef", { type: "flip", card: s.flipped[0] ?? s.cards.findIndex((c) => c.found !== null) })).toThrow();
        manager.gameAction("chef", { type: "flip", card: i });
        flips++;
      }
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    const s = snap.paires!;
    const found = s.cards.filter((c) => c.found !== null).length;
    expect(found % 2).toBe(0);
    expect(Object.values(s.scores).reduce((a, b) => a + b, 0)).toBe(found / 2);
    expect(flips).toBeGreaterThan(0);
    expect(miniGames).toBeGreaterThanOrEqual(1);
  }, 180_000);

  it("Test d'amitié : les réponses identiques rapprochent les duos, le duo le plus complice gagne", async () => {
    const { manager, room } = setup((h) => new AmitieGame(h), { mode: "amitie", amitie: { rounds: 8 } }, 3, 2);
    const me = room.players.find((p) => !p.isBot)!.id;
    let who = 0;
    let finals = 0;
    let miniGames = 0;
    let last = "";
    await untilPodium(room, () => {
      const snap0 = room.game!.snapshot();
      if (snap0.stage === "intro" && last !== "intro") {
        miniGames++;
        // Le mini-jeu arrive après la dernière question.
        expect(snap0.amitie!.round).toBe(8);
      }
      last = snap0.stage;
      if (snap0.amitie?.phase === "final") finals++;
      const a = snap0.amitie;
      if (!a || a.phase !== "answer" || a.answered.includes(me)) return;
      if (a.kind === "qui") {
        who++;
        expect(a.options).toHaveLength(3);
      }
      expect(() => manager.gameAction("chef", { type: "answer", option: 9 })).toThrow();
      manager.gameAction("chef", { type: "answer", option: 0 });
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(who).toBeGreaterThanOrEqual(2);
    expect(miniGames).toBe(1);
    expect(finals).toBeGreaterThan(0);
    expect(snap.winners.length).toBeGreaterThanOrEqual(2);
    const a = snap.amitie!;
    expect(a.asked).toBe(8 + 3);
    for (const v of Object.values(a.agree)) expect(v).toBeLessThanOrEqual(a.asked);
  }, 180_000);
});
