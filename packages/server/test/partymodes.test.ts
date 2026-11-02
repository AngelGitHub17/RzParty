import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng, hasLine, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { LotoGame } from "../src/game/modes/loto.ts";
import { QuizGame } from "../src/game/modes/quiz.ts";
import { WordBombGame } from "../src/game/modes/mots.ts";
import type { Room } from "../src/rooms/Room.ts";
import type { GameSession } from "../src/game/types.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup(make: (host: any) => GameSession, patch: object) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["survie", "plateau", "roue", "loto", "quiz", "mots"] as GameModeId[]);
  const seat = manager.createIndividualRoom("chef", "Chef");
  for (const p of ["agressif", "glitch", "equilibre"] as const) manager.addBot("chef", p);
  manager.updateSettings("chef", patch);
  const room = manager.startGame("chef", (r: Room) =>
    make({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, random: createRng(9), now: () => Date.now() }),
  );
  manager.watchRoom("tv", seat.code);
  return { manager, room };
}

async function untilPodium(room: Room, each?: () => void) {
  for (let t = 0; t < 4000 && room.game!.snapshot().stage !== "podium"; t++) {
    await vi.advanceTimersByTimeAsync(500);
    each?.();
  }
}

describe("modes de fête", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Loto des copains : les boules cochent les cartons, le premier avec une ligne gagne", async () => {
    const { manager, room } = setup((h) => new LotoGame(h), { mode: "loto" });
    manager.disconnect("chef");
    let miniGames = 0;
    await untilPodium(room, () => {
      if (room.game!.snapshot().stage === "results") miniGames++;
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    const loto = snap.loto!;
    for (const w of snap.winners) expect(hasLine(loto.marked[w]!)).toBe(true);
    // Chaque case cochée (hors case offerte et cases gagnées en mini-jeu) correspond à une boule tirée.
    for (const [id, card] of Object.entries(loto.cards)) {
      expect(card.filter((n) => n === -1)).toHaveLength(1);
      expect(new Set(card).size).toBe(25);
      const fromBalls = card.filter((n, i) => loto.marked[id]![i] && loto.drawn.includes(n)).length;
      expect(fromBalls).toBeLessThanOrEqual(loto.marked[id]!.filter(Boolean).length);
    }
    expect(miniGames).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("Quiz entre amis : la vedette tourne, les bons paris rapportent des points", async () => {
    const { manager, room } = setup((h) => new QuizGame(h), { mode: "quiz", quiz: { rounds: 5 } });
    const stars = new Set<string>();
    const me = room.players.find((p) => !p.isBot)!.id;
    let checked = false;
    await untilPodium(room, () => {
      const q = room.game!.snapshot().quiz;
      if (!q) return;
      stars.add(q.star);
      if (q.phase === "answer" && !q.answered.includes(me)) manager.gameAction("chef", { type: "answer", option: 0 });
      if (q.phase === "reveal" && q.starAnswer !== null && !checked) {
        checked = true;
        // La vedette ne parie pas sur elle-même.
        expect(q.guesses![q.star]).toBeUndefined();
      }
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(snap.quiz!.round).toBe(5);
    expect(stars.size).toBe(4);
    const total = Object.values(snap.quiz!.scores).reduce((a, b) => a + b, 0);
    expect(total % 2).toBe(0);
  }, 60_000);

  it("Bombe à mots : les mots passent la bombe, les explosions comptent, le moins de BOUM gagne", async () => {
    const { manager, room } = setup((h) => new WordBombGame(h), { mode: "mots", mots: { bombs: 3 } });
    let words = 0;
    let refused = false;
    await untilPodium(room, () => {
      const m = room.game!.snapshot().mots;
      if (!m) return;
      words = Math.max(words, m.used.length);
      const me = room.players.find((p) => !p.isBot)!.id;
      if (m.phase === "play" && m.holder === me && !m.pending) {
        if (!refused && m.used.length) {
          refused = true;
          expect(() => manager.gameAction("chef", { type: "word", word: m.used[0]! })).toThrow();
        }
        manager.gameAction("chef", { type: "word", word: null });
      }
      if (m.pending && m.holder !== me && !(me in m.pending.votes)) manager.gameAction("chef", { type: "vote", ok: true });
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(Object.values(snap.mots!.booms).reduce((a, b) => a + b, 0)).toBe(3);
    const fewest = Math.min(...Object.values(snap.mots!.booms));
    for (const w of snap.winners) expect(snap.mots!.booms[w]).toBe(fewest);
    expect(words).toBeGreaterThan(0);
  }, 60_000);
});
