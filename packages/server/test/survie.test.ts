import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { SurvivalGame } from "../src/game/modes/survie.ts";
import type { Room } from "../src/rooms/Room.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup() {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["survie"] as GameModeId[]);
  const published: { round: number; state: unknown }[] = [];
  const start = (socketId: string) =>
    manager.startGame(socketId, (room: Room) =>
      new SurvivalGame({
        room,
        changed: () => events.changed(room.code),
        publishMiniGame: (round, state) => published.push({ round, state }),
        sendPrivate: () => {},
        random: createRng(7),
        now: () => Date.now(),
      }),
    );
  return { manager, events, start, published };
}

describe("mode Survie", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("une partie de bots va jusqu'au podium avec un seul gagnant (vies)", async () => {
    const { manager, start } = setup();
    const seat = manager.createIndividualRoom("chef", "Chef");
    for (const p of ["agressif", "glitch", "lent-precis"] as const) manager.addBot("chef", p);
    manager.updateSettings("chef", { survival: { rule: "vies", lives: 3 } });
    // Le chef se déconnecte : un bot le remplace dans les mini-jeux.
    const room = start("chef");
    manager.watchRoom("tv", seat.code); // un écran reste connecté : le salon n'est pas abandonné
    manager.disconnect("chef");

    for (let i = 0; i < 400 && room.game?.snapshot().stage !== "podium"; i++) await vi.advanceTimersByTimeAsync(5_000);
    const snap = manager.snapshot(seat.code)!.game!;
    expect(snap.stage).toBe("podium");
    expect(snap.winners).toHaveLength(1);
    const alive = snap.standings.filter((s) => !s.eliminated);
    expect(alive.map((s) => s.playerId)).toEqual(snap.winners);
  });

  it("en mode score, la partie s'arrête quand un joueur atteint l'objectif", async () => {
    const { manager, start } = setup();
    const seat = manager.createIndividualRoom("chef", "Chef");
    manager.addBot("chef", "equilibre");
    manager.addBot("chef", "glitch");
    manager.updateSettings("chef", { survival: { rule: "score", targetScore: 5 } });
    const room = start("chef");
    manager.watchRoom("tv", seat.code);
    manager.disconnect("chef");
    for (let i = 0; i < 400 && room.game?.snapshot().stage !== "podium"; i++) await vi.advanceTimersByTimeAsync(5_000);
    const snap = manager.snapshot(seat.code)!.game!;
    expect(snap.stage).toBe("podium");
    const best = Math.max(...snap.standings.map((s) => s.score));
    expect(best).toBeGreaterThanOrEqual(5);
    expect(snap.winners.every((id) => snap.standings.find((s) => s.playerId === id)!.score === best)).toBe(true);
  });

  it("présente les règles puis passe au compte à rebours quand tout le monde est prêt", async () => {
    const { manager, start } = setup();
    manager.createIndividualRoom("chef", "Chef");
    manager.addBot("chef", "equilibre");
    const room = start("chef");
    expect(room.game!.snapshot().stage).toBe("intro");
    manager.gameReady("chef");
    await vi.advanceTimersByTimeAsync(1000);
    expect(room.game!.snapshot().stage).toBe("countdown");
    await vi.advanceTimersByTimeAsync(3000);
    expect(room.game!.snapshot().stage).toBe("play");
  });

  it("le chef ramène tout le monde au salon et les réglages redeviennent modifiables", () => {
    const { manager, start } = setup();
    const seat = manager.createIndividualRoom("chef", "Chef");
    manager.addBot("chef", "equilibre");
    start("chef");
    expect(() => manager.addBot("chef", "glitch")).toThrow();
    manager.backToLobby("chef");
    expect(manager.getRoom(seat.code)!.phase).toBe("salon");
    expect(manager.getRoom(seat.code)!.game).toBeNull();
    manager.addBot("chef", "glitch");
  });

  it("un joueur exclu pendant la partie est éliminé", () => {
    const { manager, start } = setup();
    const room0 = manager.createSharedRoom("tv");
    manager.join("a", room0.code, "Alice");
    const b = manager.join("b", room0.code, "Bob");
    manager.addBot("a", "equilibre");
    const room = start("a");
    manager.kick("a", b.playerId);
    expect(room.game!.snapshot().standings.find((s) => s.playerId === b.playerId)?.eliminated).toBe(true);
  });
});
