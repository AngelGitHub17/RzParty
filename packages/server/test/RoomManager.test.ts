import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERRORS, MAX_PLAYERS, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup(modes: GameModeId[] = []) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => modes);
  return { manager, events };
}

describe("RoomManager", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fait du premier joueur le chef d'un salon écran commun", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    const a = manager.join("a", room.code, "Alice");
    manager.join("b", room.code.toLowerCase(), "Bob");
    const r = manager.getRoom(room.code)!;
    expect(r.chef?.id).toBe(a.playerId);
    expect(r.players.map((p) => p.color)).toEqual([0, 1]);
  });

  it("le créateur d'un salon individuel est chef", () => {
    const { manager } = setup();
    const seat = manager.createIndividualRoom("a", "  Alice  ");
    const room = manager.getRoom(seat.code)!;
    expect(room.displayMode).toBe("individuel");
    expect(room.chef?.name).toBe("Alice");
  });

  it("refuse un code inconnu et un pseudo vide", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    expect(() => manager.join("a", "ZZZZ", "Alice")).toThrow(ERRORS.roomNotFound);
    expect(() => manager.join("a", room.code, "   ")).toThrow(ERRORS.nameRequired);
  });

  it("rend les pseudos uniques", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Léa");
    manager.join("b", room.code, "léa");
    expect(manager.getRoom(room.code)!.players.map((p) => p.name)).toEqual(["Léa", "léa 2"]);
  });

  it("passe le rôle de chef au suivant après le délai de grâce", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    const b = manager.join("b", room.code, "Bob");
    manager.disconnect("a");
    expect(manager.getRoom(room.code)!.chef?.name).toBe("Alice");
    vi.advanceTimersByTime(timings.chefGrace);
    expect(manager.getRoom(room.code)!.chef?.id).toBe(b.playerId);
  });

  it("le chef qui revient à temps garde son rôle", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    const a = manager.join("a", room.code, "Alice");
    manager.join("b", room.code, "Bob");
    manager.disconnect("a");
    vi.advanceTimersByTime(5_000);
    manager.resume("a2", room.code, a.token);
    vi.advanceTimersByTime(timings.chefGrace);
    expect(manager.getRoom(room.code)!.chef?.id).toBe(a.playerId);
  });

  it("le chef qui part volontairement est remplacé tout de suite", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    manager.join("b", room.code, "Bob");
    manager.leave("a");
    expect(manager.getRoom(room.code)!.chef?.name).toBe("Bob");
  });

  it("libère la place d'un joueur absent trop longtemps", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    const b = manager.join("b", room.code, "Bob");
    manager.disconnect("b");
    vi.advanceTimersByTime(timings.lobbySeatHold);
    expect(manager.getRoom(room.code)!.players).toHaveLength(1);
    expect(() => manager.resume("b2", room.code, b.token)).toThrow(ERRORS.sessionExpired);
  });

  it("une reprise depuis un autre appareil détache l'ancien", () => {
    const { manager, events } = setup();
    const room = manager.createSharedRoom("ecran");
    const a = manager.join("a", room.code, "Alice");
    manager.resume("a-tel", room.code, a.token);
    expect(events.detached).toHaveBeenCalledWith("a", "replaced");
    expect(manager.bindingOf("a")).toBeUndefined();
  });

  it("seul le chef ajoute des bots, dans la limite de 8", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    manager.join("b", room.code, "Bob");
    expect(() => manager.addBot("b", "agressif")).toThrow(ERRORS.notChef);
    expect(() => manager.addBot("a", "inconnu")).toThrow(ERRORS.invalidBot);
    for (let i = 0; i < MAX_PLAYERS - 2; i++) manager.addBot("a", "glitch");
    expect(() => manager.addBot("a", "glitch")).toThrow(ERRORS.roomFull);
    const names = manager.getRoom(room.code)!.bots.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("un humain prend la place d'un bot quand le salon est plein", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    for (let i = 0; i < MAX_PLAYERS - 1; i++) manager.addBot("a", "equilibre");
    manager.join("c", room.code, "Chloé");
    const r = manager.getRoom(room.code)!;
    expect(r.players).toHaveLength(MAX_PLAYERS);
    expect(r.humans.map((p) => p.name)).toEqual(["Alice", "Chloé"]);
  });

  it("les couleurs restent uniques", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    manager.join("b", room.code, "Bob");
    expect(() => manager.setColor("b", 0)).toThrow(ERRORS.colorTaken);
    manager.setColor("b", 5);
    expect(manager.getRoom(room.code)!.players[1]!.color).toBe(5);
    expect(() => manager.setColor("b", 42)).toThrow(ERRORS.invalidColor);
  });

  it("le chef exclut un joueur", () => {
    const { manager, events } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    const b = manager.join("b", room.code, "Bob");
    manager.kick("a", b.playerId);
    expect(events.detached).toHaveBeenCalledWith("b", "kicked");
    expect(manager.getRoom(room.code)!.players).toHaveLength(1);
  });

  it("ignore les réglages invalides", () => {
    const { manager } = setup();
    const seat = manager.createIndividualRoom("a", "Alice");
    manager.updateSettings("a", { mode: "plateau", botDifficulty: "impossible", survival: { lives: 99, rule: "score" } });
    const s = manager.getRoom(seat.code)!.settings;
    expect(s.mode).toBe("plateau");
    expect(s.botDifficulty).toBe("moyen");
    expect(s.survival).toEqual({ rule: "score", lives: 3, targetScore: 10 });
  });

  it("refuse de lancer un mode indisponible ou un salon trop petit", () => {
    const { manager } = setup(["survie"]);
    const seat = manager.createIndividualRoom("a", "Alice");
    expect(() => manager.checkCanStart("a")).toThrow(ERRORS.notEnoughPlayers);
    manager.addBot("a", "equilibre");
    expect(manager.checkCanStart("a").code).toBe(seat.code);
    manager.updateSettings("a", { mode: "plateau" });
    expect(() => manager.checkCanStart("a")).toThrow(ERRORS.modeUnavailable);
  });

  it("ferme un salon abandonné", () => {
    const { manager, events } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.join("a", room.code, "Alice");
    manager.disconnect("ecran");
    manager.disconnect("a");
    vi.advanceTimersByTime(timings.roomIdle);
    expect(manager.getRoom(room.code)).toBeUndefined();
    expect(events.closed).toHaveBeenCalled();
  });

  it("garde le salon si l'écran commun recharge sa page", () => {
    const { manager } = setup();
    const room = manager.createSharedRoom("ecran");
    manager.disconnect("ecran");
    manager.watchRoom("ecran2", room.code);
    vi.advanceTimersByTime(timings.roomIdle);
    expect(manager.getRoom(room.code)).toBeDefined();
  });

  it("ferme immédiatement un salon individuel quand son seul joueur part", () => {
    const { manager } = setup();
    const seat = manager.createIndividualRoom("a", "Alice");
    manager.leave("a");
    expect(manager.getRoom(seat.code)).toBeUndefined();
  });
});

describe("pseudos refusés", () => {
  it("demande un autre pseudo s'il ne respecte pas les règles (invité ou profil)", () => {
    const { manager } = setup();
    expect(() => manager.createIndividualRoom("s1", "connard")).toThrow(/mot interdit/);
    expect(() => manager.createIndividualRoom("s2", "admin")).toThrow(/réservé/);
    const seat = manager.createIndividualRoom("s3", "Léa");
    expect(seat.code).toHaveLength(4);
    expect(() => manager.createIndividualRoom("s4", { name: "Merde", avatar: {}, profileId: "p1" })).toThrow(/doit être changé/);
  });
});
