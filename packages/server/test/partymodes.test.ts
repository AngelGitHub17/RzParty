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

  it("Bingo des copains : grilles toutes différentes, on coche à la sortie, le premier avec une ligne de 4 gagne", async () => {
    const { manager, room } = setup((h) => new LotoGame(h), { mode: "loto" });
    const me = room.players.find((p) => !p.isBot)!.id;
    // Choix de la grille : une grille prise ne peut pas être reprise.
    await vi.advanceTimersByTimeAsync(3000);
    const l0 = room.game!.snapshot().loto!;
    expect(l0.phase).toBe("choose");
    expect(l0.grids.length).toBeGreaterThanOrEqual(6);
    for (const g of l0.grids) expect(new Set(g).size).toBe(16);
    const taken = Object.values(l0.choice).find((c) => c !== null)!;
    expect(() => manager.gameAction("chef", { type: "grid", grid: taken })).toThrow();
    const free = l0.grids.findIndex((_, i) => !Object.values(l0.choice).includes(i));
    manager.gameAction("chef", { type: "grid", grid: free });
    let marks = 0;
    let lateRefused = false;
    await untilPodium(room, () => {
      const l = room.game!.snapshot().loto!;
      if (l.phase !== "draw" || l.markable === null) return;
      const grid = l.grids[l.choice[me]!]!;
      const pos = grid.indexOf(l.markable);
      // Un personnage déjà passé ne peut plus être coché.
      const late = grid.findIndex((n, i) => n !== l.markable && l.drawn.includes(n) && !l.marked[me]![i]);
      if (late >= 0 && !lateRefused) {
        expect(() => manager.gameAction("chef", { type: "mark", cell: late })).toThrow();
        lateRefused = true;
      }
      if (pos >= 0 && !l.marked[me]![pos]) {
        manager.gameAction("chef", { type: "mark", cell: pos });
        marks++;
      }
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    const loto = snap.loto!;
    expect(new Set(Object.values(loto.choice)).size).toBe(4);
    for (const w of snap.winners) expect(hasLine(loto.marked[w]!)).toBe(true);
    expect(marks).toBeGreaterThan(0);
    expect(loto.left.minigames).toBeLessThanOrEqual(10);
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
