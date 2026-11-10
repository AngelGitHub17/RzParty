import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR, ERRORS } from "@rzparty/shared";
import { ProfileStore } from "../src/profiles/ProfileStore.ts";
import { AdminStore } from "../src/profiles/AdminStore.ts";
import { RoomManager } from "../src/rooms/RoomManager.ts";

const quiet = { log: () => {}, saveDelayMs: 0 };
const fresh = () => mkdtempSync(join(tmpdir(), "rz-profils-"));

describe("ProfileStore", () => {
  it("crée, retrouve par jeton et refuse les doublons de pseudo", () => {
    const store = new ProfileStore(fresh(), quiet);
    const { profile, token } = store.create("Didi", DEFAULT_AVATAR);
    expect(store.byToken(token).id).toBe(profile.id);
    expect(() => store.create("didi", DEFAULT_AVATAR)).toThrow(ERRORS.nameTaken);
    expect(() => store.byToken("faux")).toThrow(ERRORS.profileNotFound);
  });

  it("protège un profil par PIN et bloque après 5 erreurs", () => {
    const store = new ProfileStore(fresh(), quiet);
    const { profile } = store.create("Angel", DEFAULT_AVATAR, "1234");
    expect(profile.hasPin).toBe(true);
    expect(() => store.unlock(profile.id)).toThrow(ERRORS.profileLocked);
    expect(store.unlock(profile.id, "1234").token).toBeTruthy();
    for (let i = 0; i < 4; i++) expect(() => store.unlock(profile.id, "0000")).toThrow(ERRORS.wrongPin);
    expect(() => store.unlock(profile.id, "0000")).toThrow(ERRORS.pinLocked);
    expect(() => store.unlock(profile.id, "1234")).toThrow(ERRORS.pinLocked);
    expect(() => store.create("Xavier", DEFAULT_AVATAR, "12")).toThrow(ERRORS.invalidPin);
  });

  it("garde les profils et statistiques après redémarrage", () => {
    const dir = fresh();
    const a = new ProfileStore(dir, quiet);
    const { profile, token } = a.create("Tesy", DEFAULT_AVATAR);
    a.recordRound(profile.id, { miniGameId: "reflexes", won: true, records: { reaction: 300 }, definitions: [{ key: "reaction", better: "lower" }] });
    a.recordRound(profile.id, { miniGameId: "reflexes", won: false, records: { reaction: 450 }, definitions: [{ key: "reaction", better: "lower" }] });
    a.recordGame(profile.id, true);
    a.flush();
    const b = new ProfileStore(dir, quiet);
    const s = b.byToken(token).stats;
    expect(s).toMatchObject({ gamesPlayed: 1, gamesWon: 1, roundsPlayed: 2, roundsWon: 1 });
    expect(s.perGame.reflexes).toEqual({ played: 2, won: 1 });
    expect(s.records["reflexes.reaction"]).toBe(300);
  });

  it("détecte une sauvegarde modifiée à la main : bien essayé, sauvegarde effacée", () => {
    const dir = fresh();
    const a = new ProfileStore(dir, quiet);
    const { profile } = a.create("Tricheur", DEFAULT_AVATAR);
    const honest = a.create("Honnête", DEFAULT_AVATAR).profile;
    a.recordGame(profile.id, true);
    a.recordGame(honest.id, true);
    a.flush();
    const file = join(dir, "profiles.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    data.profiles.find((p: any) => p.id === profile.id).stats.gamesWon = 999;
    writeFileSync(file, JSON.stringify(data));

    const log = vi.fn();
    const b = new ProfileStore(dir, { ...quiet, log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("bien essayé, sauvegarde effacée"));
    expect(b.get(profile.id)!.stats.gamesWon).toBe(0);
    expect(b.get(honest.id)!.stats.gamesWon).toBe(1);
    const unlocked = b.unlock(profile.id);
    expect(unlocked.tampered).toBe(true);
    expect(b.unlock(profile.id).tampered).toBe(false);
  });

  it("l'hôte renomme, retire le PIN, remet à zéro et supprime", () => {
    const store = new ProfileStore(fresh(), quiet);
    const { profile } = store.create("Toufou", DEFAULT_AVATAR, "4321");
    store.rename(profile.id, "Toufoutina");
    store.clearPin(profile.id);
    expect(store.get(profile.id)).toMatchObject({ name: "Toufoutina", hasPin: false });
    store.delete(profile.id);
    expect(store.get(profile.id)).toBeUndefined();
  });
});

describe("salons et profils", () => {
  const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };
  const setup = () => new RoomManager(timings, { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() }, () => ["survie"]);
  const didi = { name: "Didi", avatar: { ...DEFAULT_AVATAR, hat: "couronne" as const }, profileId: "p1" };

  it("un profil s'assoit avec son avatar, une seule fois par salon", () => {
    const manager = setup();
    const room = manager.createSharedRoom("tv");
    manager.join("a", room.code, didi);
    expect(manager.snapshot(room.code)!.players[0]).toMatchObject({ name: "Didi", profileId: "p1", avatar: { hat: "couronne" } });
    expect(() => manager.join("b", room.code, didi)).toThrow(ERRORS.profileInRoom);
  });

  it("un profil déconnecté reprend sa place en rejoignant, même pendant une partie", () => {
    const manager = setup();
    const room = manager.createSharedRoom("tv");
    const seat = manager.join("a", room.code, didi);
    manager.addBot("a", "equilibre");
    manager.disconnect("a");
    const again = manager.join("a2", room.code, didi);
    expect(again.playerId).toBe(seat.playerId);
    expect(manager.getRoom(room.code)!.players).toHaveLength(2);
  });

  it("une modification de profil se voit dans le salon", () => {
    const manager = setup();
    const room = manager.createSharedRoom("tv");
    manager.join("a", room.code, didi);
    manager.applyProfile({ id: "p1", name: "DidiKaria", avatar: { ...DEFAULT_AVATAR, body: 5 }, hasPin: false, stats: {} as any, createdAt: 0, lastSeenAt: 0 });
    expect(manager.snapshot(room.code)!.players[0]).toMatchObject({ name: "DidiKaria", avatar: { body: 5 } });
  });

  it("les bots et les invités reçoivent un avatar", () => {
    const manager = setup();
    const room = manager.createSharedRoom("tv");
    manager.join("a", room.code, "Invité");
    manager.addBot("a", "glitch");
    for (const p of manager.snapshot(room.code)!.players) expect(p.avatar).toBeDefined();
  });
});

describe("AdminStore", () => {
  it("crée le compte une seule fois, puis connecte avec le bon mot de passe", () => {
    const dir = fresh();
    const admin = new AdminStore(dir);
    expect(admin.configured).toBe(false);
    expect(() => admin.setup("hote", "123")).toThrow(ERRORS.adminPasswordShort);
    const token = admin.setup("Hote", "secret42");
    admin.check(token);
    expect(() => admin.setup("autre", "secret42")).toThrow(ERRORS.adminExists);
    const again = new AdminStore(dir);
    expect(again.configured).toBe(true);
    expect(() => again.check(token)).toThrow(ERRORS.adminSession);
    expect(() => again.login("hote", "mauvais")).toThrow(ERRORS.adminWrong);
    again.check(again.login("hote", "secret42"));
  });

  it("retrouve un profil par son pseudo sans exposer la liste", () => {
    const store = new ProfileStore(fresh(), quiet);
    store.create("Angel", DEFAULT_AVATAR, "1111");
    expect(store.findByName("angel")).toMatchObject({ name: "Angel", hasPin: true });
    expect(() => store.findByName("Inconnu")).toThrow(ERRORS.noProfileWithName);
  });
});
