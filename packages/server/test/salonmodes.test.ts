import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng, tictacAnswerOk, type GameModeId, type TictacTask } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { CrisGame } from "../src/game/modes/cris.ts";
import { CacheGame } from "../src/game/modes/cache.ts";
import { TictacGame } from "../src/game/modes/tictac.ts";
import { IntrusGame } from "../src/game/modes/intrus.ts";
import { LibreGame } from "../src/game/modes/libre.ts";
import { BatailleGame } from "../src/game/modes/bataille.ts";
import { SoloGame } from "../src/game/modes/solo.ts";
import { DefisGame } from "../src/game/modes/defis.ts";
import { ChallengeStore } from "../src/profiles/ChallengeStore.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Room } from "../src/rooms/Room.ts";
import type { GameSession } from "../src/game/types.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

/** Salon avec deux humains (chef, ami) et `bots` bots. */
function setup(make: (host: any) => GameSession, patch: object, bots = 1) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["cris", "cache", "tictac", "libre", "bataille", "solo"] as GameModeId[]);
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
  for (let t = 0; t < 12000 && room.game!.snapshot().stage !== "podium"; t++) {
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

describe("L'intrus et Jeu libre", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("L'intrus : un tricheur secret par manche, coups de pouce, vote et révélation", async () => {
    const whispers: { id: string; data: unknown }[] = [];
    const secrets: Record<string, boolean> = {};
    const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
    const manager = new RoomManager(timings, events, () => ["intrus"] as GameModeId[]);
    const seat = manager.createIndividualRoom("chef", "Chef");
    manager.join("ami", seat.code, "Amélie");
    manager.addBot("chef", "equilibre");
    manager.updateSettings("chef", { mode: "intrus", intrus: { rounds: 3 } });
    const room = manager.startGame("chef", (r: Room) =>
      new IntrusGame({
        room: r,
        changed: () => events.changed(r.code),
        publishMiniGame: () => {},
        sendPrivate: (id, _round, data) => whispers.push({ id, data }),
        sendBoardPrivate: (id, data) => (secrets[id] = data.intrus === true),
        random: createRng(3),
        now: () => Date.now(),
      }),
    );
    const humans = room.players.filter((p) => !p.isBot).map((p) => p.id);
    const reveals: string[] = [];
    await untilPodium(room, () => {
      const g = room.game!.snapshot();
      for (const id of humans) if (g.stage === "intro") room.game!.ready(id);
      const s = g.intrus!;
      if (g.stage === "intrus" && s.phase === "vote") {
        for (const id of humans) {
          if (s.voted.includes(id)) continue;
          // On vote pour le premier autre joueur.
          const suspect = Object.keys(s.scores).find((x) => x !== id)!;
          manager.gameAction(id === humans[0] ? "chef" : "ami", { type: "vote", suspect });
        }
      }
      if (g.stage === "intrus" && s.phase === "reveal" && s.reveal && !reveals.includes(`${s.round}`)) {
        reveals.push(`${s.round}`);
        // Exactement un intrus, et lui seul avait reçu le secret.
        expect(Object.entries(secrets).filter(([, v]) => v).map(([k]) => k)).toEqual([s.reveal.cheater]);
      }
    });
    expect(room.game!.snapshot().stage).toBe("podium");
    expect(reveals.length).toBe(3);
    // Les coups de pouce ne vont qu'à l'intrus (humain) de la manche.
    for (const w of whispers.filter((x) => (x.data as { __whisper?: string }).__whisper)) expect(humans).toContain(w.id);
  }, 60_000);

  it("Jeu libre : le chef choisit le mini-jeu, les autres ne peuvent pas", async () => {
    const { manager, room } = setup((h) => new LibreGame(h), { mode: "libre", libre: { rounds: 5 } });
    const picked: string[] = [];
    await untilPodium(room, () => {
      const g = room.game!.snapshot();
      if (g.stage === "libre" && g.libre!.phase === "pick") {
        expect(() => manager.gameAction("ami", { type: "pick", game: "hasard" })).toThrow();
        const choice = g.libre!.choices[picked.length % g.libre!.choices.length]!;
        manager.gameAction("chef", { type: "pick", game: choice });
        picked.push(choice);
      }
      if (g.stage === "intro") for (const p of room.players) room.game!.ready(p.id);
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    expect(picked.length).toBe(5);
    expect(snap.libre!.played).toEqual([...new Set(picked)]);
  }, 60_000);
});

describe("Bataille et Parcours solo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Bataille : deux équipes, le foulard avance d'un cran par manche jusqu'au camp gagnant", async () => {
    const { room } = setup((h) => new BatailleGame(h), { mode: "bataille", bataille: { pulls: 3 } }, 2);
    const s0 = room.game!.snapshot().bataille!;
    expect(s0.teams[0].length).toBe(2);
    expect(s0.teams[1].length).toBe(2);
    let maxRound = 0;
    await untilPodium(room, () => {
      const g = room.game!.snapshot();
      if (g.stage === "intro") for (const p of room.players) room.game!.ready(p.id);
      maxRound = Math.max(maxRound, g.bataille!.round);
      expect(Math.abs(g.bataille!.rope)).toBeLessThanOrEqual(3);
    });
    const snap = room.game!.snapshot();
    expect(snap.stage).toBe("podium");
    const b = snap.bataille!;
    expect(Math.abs(b.rope)).toBe(3);
    const winners = b.rope < 0 ? b.teams[0] : b.teams[1];
    expect([...snap.winners].sort()).toEqual([...winners].sort());
    expect(maxRound).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("Parcours solo : les humains avancent en finissant devant les bots, sinon ils perdent une vie", async () => {
    const { room, chef, ami } = setup((h) => new SoloGame(h), { mode: "solo", solo: { stages: 6, lives: 3 } }, 2);
    let changes = 0;
    await untilPodium(room, () => {
      const g = room.game!.snapshot();
      if (g.stage === "intro") for (const p of room.players) room.game!.ready(p.id);
      if (g.stage === "results") changes++;
    });
    const s = room.game!.snapshot().solo!;
    // Les bots n'ont pas de progression : seuls les humains sont sur la carte.
    expect(Object.keys(s.progress).sort()).toEqual([chef, ami].sort());
    for (const id of [chef, ami]) expect(s.progress[id] === 6 || s.lives[id] === 0).toBe(true);
    expect(changes).toBeGreaterThan(0);
  }, 120_000);
});

describe("Défis", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Défis : l'équipe gagne des points tant qu'elle bat les bots, perd un cœur sinon, et le score entre au tableau", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rz-defis-"));
    const store = new ChallengeStore(dir);
    store.submit(50, ["Ancien"], 1);
    const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
    const manager = new RoomManager(timings, events, () => ["defis"] as GameModeId[]);
    const seat = manager.createIndividualRoom("chef", "Chef");
    manager.join("ami", seat.code, "Amélie");
    manager.addBot("chef", "equilibre");
    manager.updateSettings("chef", { mode: "defis", defis: { hearts: 3 } });
    const room = manager.startGame("chef", (r: Room) =>
      new DefisGame({ room: r, changed: () => events.changed(r.code), publishMiniGame: () => {}, sendPrivate: () => {}, challenges: store, random: createRng(9), now: () => Date.now() }),
    );
    let lastHearts = 3;
    let lastScore = 0;
    await untilPodium(room, () => {
      const g = room.game!.snapshot();
      if (g.stage === "intro") for (const p of room.players) room.game!.ready(p.id);
      const d = g.defis!;
      expect(d.hearts).toBeLessThanOrEqual(lastHearts);
      expect(d.score).toBeGreaterThanOrEqual(lastScore);
      lastHearts = d.hearts;
      lastScore = d.score;
    });
    const d = room.game!.snapshot().defis!;
    expect(d.hearts).toBe(0);
    expect(d.phase).toBe("done");
    // Le tableau contient le score de l'équipe (s'il dépasse 0) et reste trié.
    const list = new ChallengeStore(dir).list();
    expect(list.map((r) => r.score)).toEqual([...list.map((r) => r.score)].sort((a, b) => b - a));
    if (d.score > 0) expect(list.some((r) => r.score === d.score && r.names.includes("Amélie"))).toBe(true);
  }, 120_000);
});
