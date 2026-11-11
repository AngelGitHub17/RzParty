import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng, tictacAnswerOk, type GameModeId, type TictacTask } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { CrisGame } from "../src/game/modes/cris.ts";
import { CacheGame } from "../src/game/modes/cache.ts";
import { TictacGame } from "../src/game/modes/tictac.ts";
import type { Room } from "../src/rooms/Room.ts";
import type { GameSession } from "../src/game/types.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

/** Salon avec deux humains (chef, ami) et `bots` bots. */
function setup(make: (host: any) => GameSession, patch: object, bots = 1) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["cris", "cache", "tictac"] as GameModeId[]);
  const seat = manager.createIndividualRoom("chef", "Chef");
  manager.join("ami", seat.code, "Amélie");
  for (const p of (["agressif", "glitch", "equilibre"] as const).slice(0, bots)) manager.addBot("chef", p);
  manager.updateSettings("chef", patch);
  const room = manager.startGame("chef", (r: Room) =>
    make({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, random: createRng(5), now: () => Date.now() }),
  );
  const chef = room.players.find((p) => p.name === "Chef")!.id;
  const ami = room.players.find((p) => p.name === "Amélie")!.id;
  return { manager, room, chef, ami };
}

async function untilPodium(room: Room, each?: () => void) {
  for (let t = 0; t < 4000 && room.game!.snapshot().stage !== "podium"; t++) {
    await vi.advanceTimersByTimeAsync(250);
    each?.();
  }
}

describe("jeux de salon", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Cris en folie : un cri par téléphone, le bon téléphone rapporte un point, une erreur bloque", async () => {
    const { manager, room, chef, ami } = setup((h) => new CrisGame(h), { mode: "cris", cris: { points: 3 } });
    let wrongTried = false;
    await untilPodium(room, () => {
      const c = room.game!.snapshot().cris!;
      if (c.phase !== "listen" || c.target === null) return;
      // Les bots n'ont pas de téléphone : seuls les deux humains crient, chacun une bête différente.
      expect(Object.keys(c.sounds).sort()).toEqual([chef, ami].sort());
      expect(new Set(Object.values(c.sounds)).size).toBe(2);
      const good = Object.keys(c.sounds).find((d) => c.sounds[d] === c.target)!;
      const bad = Object.keys(c.sounds).find((d) => c.sounds[d] !== c.target)!;
      if (!wrongTried && !c.lockedOut.includes(ami)) {
        wrongTried = true;
        // Amélie attrape le mauvais téléphone : bloquée pour la manche.
        manager.gameAction(bad === chef ? "chef" : "ami", { type: "claim", by: ami });
        expect(room.game!.snapshot().cris!.lockedOut).toContain(ami);
        expect(() => manager.gameAction(good === chef ? "chef" : "ami", { type: "claim", by: ami })).toThrow();
        return;
      }
      if (!c.lockedOut.includes(chef)) manager.gameAction(good === chef ? "chef" : "ami", { type: "claim", by: chef });
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(wrongTried).toBe(true);
    for (const w of snap.winners) expect(snap.cris!.scores[w]).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("Cache-cache : chacun cache à son tour, les téléphones trouvés rapportent des points", async () => {
    const { manager, room, chef, ami } = setup((h) => new CacheGame(h), { mode: "cache", cache: { tours: 1 } });
    const hiders = new Set<string>();
    await untilPodium(room, () => {
      const c = room.game!.snapshot().cache!;
      if (c.hider) hiders.add(c.hider);
      // Les bots ne jouent pas.
      expect(Object.keys(c.scores).sort()).toEqual([chef, ami].sort());
      const socket = (id: string) => (id === chef ? "chef" : "ami");
      if (c.phase === "hide") {
        for (const d of c.devices) if (!c.hidden.includes(d)) manager.gameAction(socket(d), { type: "hidden" });
      }
      if (c.phase === "seek") {
        const seeker = c.hider === chef ? ami : chef;
        // Le cacheur ne peut pas « trouver » ses cachettes.
        expect(() => manager.gameAction("chef", { type: "found", by: c.hider })).toThrow();
        // On n'en trouve qu'un sur deux pendant la première manche.
        const left = c.devices.filter((d) => !c.found[d]);
        if (c.round === 1 && left.length < c.devices.length) return;
        manager.gameAction(socket(left[0]!), { type: "found", by: seeker });
      }
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(hiders.size).toBe(2);
    const total = Object.values(snap.cache!.scores).reduce((a, b) => a + b, 0);
    // Manche 1 : 1 trouvé (+1), 1 resté caché (+2 cacheur). Manche 2 : 2 trouvés (+2) et bonus (+1).
    expect(total).toBe(6);
  }, 60_000);

  it("Tic-tac-boum : les consignes réussies passent la bombe, les erreurs raccourcissent la mèche", async () => {
    const { manager, room, chef, ami } = setup((h) => new TictacGame(h), { mode: "tictac", tictac: { bombs: 3 } }, 2);
    let passes = 0;
    let slips = 0;
    await untilPodium(room, () => {
      const t = room.game!.snapshot().tictac!;
      if (t.phase !== "play" || !t.task) return;
      // Amélie réussit toujours ; le chef se trompe deux fois.
      if (t.holder === ami) manager.gameAction("ami", { type: "task", taskId: t.taskId, answer: solve(t.task) });
      else if (t.holder === chef) {
        // Une fois sur deux, on se trompe exprès.
        const wrong = slips < 2;
        manager.gameAction("chef", { type: "task", taskId: t.taskId, answer: wrong ? "non" : solve(t.task) });
        const after = room.game!.snapshot().tictac!;
        if (wrong) {
          slips++;
          expect(after.holder).toBe(chef);
          expect(after.slip?.playerId).toBe(chef);
        } else {
          passes++;
          expect(after.holder).not.toBe(chef);
        }
      }
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(Object.values(snap.tictac!.booms).reduce((a, b) => a + b, 0)).toBe(3);
    expect(passes + slips).toBeGreaterThan(0);
  }, 60_000);

  it("Tic-tac-boum : vérification des réponses", () => {
    const tasks: TictacTask[] = [
      { kind: "fil", wires: [0, 2, 3], target: 2 },
      { kind: "symbole", symbols: [1, 4, 5], target: 5 },
      { kind: "compte", count: 4 },
      { kind: "maintiens", min: 2000, max: 3400 },
      { kind: "ordre", cells: [3, 1, 4, 2] },
    ];
    for (const t of tasks) expect(tictacAnswerOk(t, solve(t))).toBe(true);
    expect(tictacAnswerOk(tasks[0]!, 3)).toBe(false);
    expect(tictacAnswerOk(tasks[2]!, 5)).toBe(false);
    expect(tictacAnswerOk(tasks[3]!, 900)).toBe(false);
    expect(tictacAnswerOk(tasks[4]!, [0, 1, 2, 3])).toBe(false);
  });
});

function solve(task: TictacTask): unknown {
  switch (task.kind) {
    case "fil":
    case "symbole":
      return task.target;
    case "compte":
      return task.count;
    case "maintiens":
      return 2500;
    case "ordre":
      return task.cells.map((_, i) => task.cells.indexOf(i + 1));
  }
}
