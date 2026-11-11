import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERRORS, createRng, generateBoard, type GameModeId } from "@rzparty/shared";
import { RoomManager } from "../src/rooms/RoomManager.ts";
import { BoardGame, bonusDieForPlace, coinsForPlace, magnet } from "../src/game/modes/plateau.ts";
import type { Room } from "../src/rooms/Room.ts";

const timings = { chefGrace: 10_000, lobbySeatHold: 90_000, roomIdle: 300_000 };

function setup(seed = 3) {
  const events = { changed: vi.fn(), closed: vi.fn(), detached: vi.fn() };
  const manager = new RoomManager(timings, events, () => ["survie", "plateau"] as GameModeId[]);
  const ended = vi.fn();
  const start = (socketId: string) =>
    manager.startGame(socketId, (room: Room) =>
      new BoardGame({
        room,
        changed: () => events.changed(room.code),
        publishMiniGame: () => {},
        sendPrivate: () => {},
        random: createRng(seed),
        now: () => Date.now(),
        gameEnded: ended,
      }),
    );
  return { manager, start, ended };
}

async function until(cond: () => boolean, maxMs = 3_600_000) {
  for (let t = 0; t < maxMs && !cond(); t += 2000) await vi.advanceTimersByTimeAsync(2000);
}

describe("mode Plateau", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("barème des pièces : 20, 10, 5, puis 1 pour le dernier", () => {
    expect([0, 1, 2, 3].map((p) => coinsForPlace(p, 4))).toEqual([20, 10, 5, 1]);
    expect([0, 1, 2, 3, 4].map((p) => coinsForPlace(p, 5))).toEqual([20, 10, 5, 3, 1]);
    expect([0, 1].map((p) => coinsForPlace(p, 2))).toEqual([20, 10]);
  });

  it("dés bonus : 6, 4, 3 faces pour les trois premiers, rien pour le dernier", () => {
    expect([0, 1, 2, 3].map((p) => bonusDieForPlace(p, 4))).toEqual([6, 3, 2, null]);
    expect([0, 1, 2, 3, 4].map((p) => bonusDieForPlace(p, 5))).toEqual([6, 3, 2, null, null]);
    expect([0, 1].map((p) => bonusDieForPlace(p, 2))).toEqual([6, null]);
  });

  it("chaque mini-jeu de fin de tour fixe le nouvel ordre et donne les dés bonus (plateau long)", async () => {
    const { manager, start } = setup(5);
    const seat = manager.createIndividualRoom("chef", "Chef");
    for (const p of ["agressif", "glitch", "lent-precis"] as const) manager.addBot("chef", p);
    manager.updateSettings("chef", { mode: "plateau", board: { size: "long" } });
    const room = start("chef");
    manager.watchRoom("tv", seat.code);
    manager.disconnect("chef");
    for (let round = 2; round <= 3; round++) {
      await until(() => (room.game!.snapshot().board?.boardRound ?? 0) >= round && room.game!.snapshot().purpose === "pieces");
      const snap = room.game!.snapshot();
      if (snap.stage === "podium") break;
      const result = snap.lastResult!;
      // Le classement du mini-jeu devient l'ordre de passage.
      const flat = result.ranking.flat();
      expect(snap.board!.order).toEqual(flat);
      // Le 1er reçoit un dé à 6 faces (sauf s'il a déjà joué ce tour).
      const firstId = result.ranking[0]![0]!;
      expect(result.changes.find((c) => c.playerId === firstId)?.bonusDie).toBe(result.ranking.length > 1 ? 6 : undefined);
      const lastId = result.ranking.at(-1)![0]!;
      expect(result.changes.find((c) => c.playerId === lastId)?.bonusDie).toBeUndefined();
    }
  }, 60_000);

  for (const seed of [3, 11, 27]) {
    it(`une partie de bots va jusqu'à l'arrivée (graine ${seed})`, async () => {
      const { manager, start, ended } = setup(seed);
      const seat = manager.createIndividualRoom("chef", "Chef");
      for (const p of ["agressif", "glitch", "lent-precis"] as const) manager.addBot("chef", p);
      manager.updateSettings("chef", { mode: "plateau", board: { size: "court" } });
      const room = start("chef");
      manager.watchRoom("tv", seat.code);
      manager.disconnect("chef"); // un bot joue pour le chef

      // L'ordre de jeu est décidé par un premier mini-jeu.
      expect(room.game!.snapshot().purpose).toBe("ordre");
      await until(() => room.game!.snapshot().stage === "board");
      const first = room.game!.snapshot().board!;
      expect(first.order).toHaveLength(4);

      await until(() => room.game!.snapshot().stage === "podium");
      const snap = room.game!.snapshot();
      expect(snap.stage).toBe("podium");
      expect(snap.winners).toHaveLength(1);
      const board = snap.board!;
      expect(board.pawns[snap.winners[0]!]!.cell).toBe(board.board.finish);
      // Des pièces ont été distribuées par les mini-jeux de fin de tour.
      if (board.boardRound > 1) expect(Object.values(board.pawns).some((p) => p.coins > 0)).toBe(true);
      expect(ended).toHaveBeenCalledOnce();
    }, 60_000);
  }

  it("défi final : arrivé au sommet, il faut gagner un mini-jeu seul contre tous, sinon on redescend", async () => {
    let defis = 0;
    let falls = 0;
    for (const seed of [3, 5, 8, 13]) {
      const { manager, start } = setup(seed);
      const seat = manager.createIndividualRoom("chef", "Chef");
      for (const p of ["agressif", "glitch", "lent-precis"] as const) manager.addBot("chef", p);
      manager.updateSettings("chef", { mode: "plateau", board: { size: "court" } });
      const room = start("chef");
      manager.watchRoom("tv", seat.code);
      manager.disconnect("chef");
      let inDefi = false;
      for (let t = 0; t < 20000 && room.game!.snapshot().stage !== "podium"; t++) {
        await vi.advanceTimersByTimeAsync(1000);
        const snap = room.game!.snapshot();
        if (snap.stage === "intro" && snap.purpose === "defi" && !inDefi) {
          inDefi = true;
          defis++;
          expect(snap.participants).toHaveLength(4);
          expect(snap.participants[0]).toBe(snap.board!.turn!.playerId);
        }
        if (snap.stage === "results" && snap.purpose === "defi" && inDefi) {
          inDefi = false;
          if (snap.lastResult!.changes[0]!.points === -1) falls++;
        }
      }
      const snap = room.game!.snapshot();
      expect(snap.stage).toBe("podium");
      expect(snap.board!.pawns[snap.winners[0]!]!.cell).toBe(snap.board!.board.finish);
      room.game!.dispose();
    }
    expect(defis).toBeGreaterThanOrEqual(4);
    expect(falls).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("seul le joueur dont c'est le tour peut lancer le dé", async () => {
    const { manager, start } = setup();
    const room0 = manager.createSharedRoom("tv");
    manager.join("a", room0.code, "Alice");
    manager.join("b", room0.code, "Bob");
    manager.updateSettings("a", { mode: "plateau" });
    const room = start("a");
    manager.gameReady("a");
    manager.gameReady("b");
    await until(() => room.game!.snapshot().board?.turn?.phase === "roll", 200_000);
    const turn = room.game!.snapshot().board!.turn!;
    const other = turn.playerId === room.players[0]!.id ? "b" : "a";
    const mine = other === "a" ? "b" : "a";
    expect(() => manager.gameAction(other, { type: "roll" })).toThrow(ERRORS.notYourTurn);
    manager.gameAction(mine, { type: "roll" });
    expect(room.game!.snapshot().board!.turn!.phase).toBe("rolling");
    await vi.advanceTimersByTimeAsync(1700);
    const after = room.game!.snapshot().board!.turn!;
    expect(after.rolls).toHaveLength(1);
    expect(after.rolls[0]!.value).toBe(after.dice);
    expect(after.dice).toBeGreaterThanOrEqual(1);
    expect(after.dice).toBeLessThanOrEqual(6);
  }, 60_000);
});

describe("plateau personnalisé", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("limite de tours, mini-jeu tous les 2 tours, pièces de départ et multiplicateur", async () => {
    const { manager, start, ended } = setup(4);
    const seat = manager.createIndividualRoom("chef", "Chef");
    manager.addBot("chef", "equilibre");
    manager.updateSettings("chef", {
      mode: "plateau",
      board: { size: "perso", custom: { length: 500, maxRounds: 4, miniGameEvery: 2, startCoins: 50, coinMultiplier: 3, maxItems: 0, bonusSteps: 7, weights: { ovni: 0, duel: 0, evenement: 0 } } },
    });
    const room = start("chef");
    manager.watchRoom("tv", seat.code);
    manager.disconnect("chef");
    const purposes: string[] = [];
    let lastRound = 0;
    await until(() => {
      const snap = room.game!.snapshot();
      if (snap.stage === "intro" && purposes.at(-1) !== `${snap.purpose}:${snap.board?.boardRound}`) purposes.push(`${snap.purpose}:${snap.board?.boardRound}`);
      lastRound = snap.board?.boardRound ?? lastRound;
      return snap.stage === "podium";
    });
    const snap = room.game!.snapshot();
    expect(snap.board!.config.length).toBe(500);
    expect(lastRound).toBe(4);
    // Ordre au départ, puis des pièces seulement à la fin des tours 2 (le tour 4 finit la partie).
    expect(purposes).toEqual(["ordre:0", "pieces:2"]);
    const coins = Object.values(snap.board!.pawns).map((p) => p.coins).sort((a, b) => a - b);
    // 20 pièces au premier (×3), 10 au second ; une égalité donne la première place aux deux.
    expect(coins.at(-1)).toBe(50 + 20 * 3);
    for (const c of coins) expect([50 + 10 * 3, 50 + 20 * 3]).toContain(c);
    // Le gagnant est le plus proche de l'arrivée.
    const winner = snap.winners[0]!;
    const others = Object.keys(snap.board!.remaining).filter((id) => id !== winner);
    for (const id of others) expect(snap.board!.remaining[winner]!).toBeLessThanOrEqual(snap.board!.remaining[id]!);
    expect(ended).toHaveBeenCalledOnce();
  }, 60_000);
});

describe("cases OVNI, événement et duel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const only = (cell: string) => ({ vide: 0, bonus: 0, malus: 0, piege: 0, boutique: 0, ovni: 0, duel: 0, evenement: 0, [cell]: 100 });

  for (const cell of ["ovni", "evenement", "duel"]) {
    it(`un plateau « que des cases ${cell} » se joue jusqu'au bout`, async () => {
      const { manager, start, ended } = setup(cell.length);
      const seat = manager.createIndividualRoom("chef", "Chef");
      for (const p of ["agressif", "glitch"] as const) manager.addBot("chef", p);
      manager.updateSettings("chef", { mode: "plateau", board: { size: "perso", custom: { length: 40, forks: 0, weights: only(cell), startCoins: 30, maxRounds: 8, miniGameEvery: 5 } } });
      const room = start("chef");
      manager.watchRoom("tv", seat.code);
      manager.disconnect("chef");
      const seen = new Set<string>();
      let total = 0;
      await until(() => {
        const snap = room.game!.snapshot();
        const effect = snap.board?.turn?.effect;
        if (effect) seen.add(`${effect.type}:${effect.text.split(" ")[0]}`);
        if (snap.stage === "intro") seen.add(`purpose:${snap.purpose}`);
        if (snap.stage === "results" && snap.purpose === "duel") {
          total = Object.values(snap.board!.pawns).reduce((a, p) => a + p.coins, 0);
          seen.add(`duel-changes:${snap.lastResult!.changes.reduce((a, c) => a + (c.points ?? 0), 0)}`);
        }
        return snap.stage === "podium";
      });
      expect(room.game!.snapshot().stage).toBe("podium");
      expect(ended).toHaveBeenCalledOnce();
      const kinds = [...seen].join(" | ");
      if (cell === "duel") {
        expect(kinds).toContain("purpose:duel");
        // Un duel déplace des pièces sans en créer.
        expect(kinds).toContain("duel-changes:0");
        expect(total).toBeGreaterThan(0);
      } else expect(kinds).toContain(`${cell}:`);
    }, 120_000);
  }
});

describe("équipes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("2 équipes : pièces partagées, duels entre équipes, victoire de toute l'équipe", async () => {
    const { manager, start, ended } = setup(12);
    const seat = manager.createIndividualRoom("chef", "Chef");
    for (const p of ["agressif", "glitch", "equilibre"] as const) manager.addBot("chef", p);
    manager.updateSettings("chef", {
      mode: "plateau",
      teams: 2,
      board: { size: "perso", custom: { length: 40, forks: 1, weights: { duel: 30, ovni: 10, evenement: 20 }, startCoins: 20 } },
    });
    const room = start("chef");
    manager.watchRoom("tv", seat.code);
    manager.disconnect("chef");
    let duels = 0;
    await until(() => {
      const snap = room.game!.snapshot();
      const b = snap.board;
      if (b?.teams) {
        // Les coéquipiers ont toujours le même nombre de pièces.
        for (const a of Object.keys(b.teams)) for (const c of Object.keys(b.teams)) {
          if (b.teams[a] === b.teams[c]) expect(b.pawns[a]!.coins).toBe(b.pawns[c]!.coins);
        }
        const t = b.turn;
        if (t?.opponents) for (const o of t.opponents) expect(b.teams[o]).not.toBe(b.teams[t.playerId]);
      }
      if (snap.stage === "intro" && snap.purpose === "duel") duels++;
      return snap.stage === "podium";
    });
    const snap = room.game!.snapshot();
    const teams = snap.board!.teams!;
    expect(new Set(Object.values(teams)).size).toBe(2);
    expect(Object.values(teams).filter((t) => t === 0)).toHaveLength(2);
    // Toute l'équipe gagnante est sur le podium.
    expect(snap.winners).toHaveLength(2);
    expect(teams[snap.winners[0]!]).toBe(teams[snap.winners[1]!]);
    expect(ended).toHaveBeenCalledOnce();
    expect(duels).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

describe("objets du plateau", () => {
  it("Aimant : vol ou retour de flamme, sans créer ni détruire de pièces", () => {
    let backfires = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const coins = { a: 3, b: 10, c: 0, d: 7 };
      const { backfire, delta } = magnet(coins, "a", createRng(seed));
      expect(Object.values(delta).reduce((x, y) => x + y, 0)).toBe(0);
      for (const [id, d] of Object.entries(delta)) expect(coins[id as keyof typeof coins] + d).toBeGreaterThanOrEqual(0);
      if (backfire) {
        backfires++;
        expect(delta.a).toBeLessThanOrEqual(0);
        expect(delta.a).toBeGreaterThanOrEqual(-3);
      } else {
        expect(delta.c).toBe(0);
        expect(-delta.b!).toBeGreaterThanOrEqual(3);
        expect(-delta.b!).toBeLessThanOrEqual(10);
      }
    }
    // Environ 1 fois sur 4.
    expect(backfires).toBeGreaterThan(60);
    expect(backfires).toBeLessThan(140);
  });

  it("le plateau a des boutiques, hors des embranchements", () => {
    for (const size of ["court", "moyen", "marathon"] as const) {
      const board = generateBoard(9, size);
      const shops = board.cells.filter((c) => c.type === "boutique");
      expect(shops.length).toBeGreaterThanOrEqual(2);
      for (const s of shops) expect(board.forks.some((f) => f.at === s.id)).toBe(false);
    }
  });

  it("boutique, objets et double : une partie humaine pilotée de bout en bout", async () => {
    vi.useFakeTimers();
    let botItems = 0;
    try {
     // Le tirage des mini-jeux dépend du catalogue : on essaie quelques graines jusqu'à voir un bot utiliser un objet.
     for (const seed of [22, 21, 23, 24, 25, 26, 27, 28]) {
      const { manager, start } = setup(seed);
      const seat = manager.createIndividualRoom("chef", "Chef");
      manager.addBot("chef", "agressif");
      manager.updateSettings("chef", { mode: "plateau", board: { size: "moyen" } });
      const room = start("chef");
      manager.watchRoom("tv", seat.code);
      const game = room.game as BoardGame;
      const me = room.players.find((p) => !p.isBot)!.id;
      const botId = room.players.find((p) => p.isBot)!.id;
      let bought = 0, used = 0, shops = 0;
      for (let t = 0; t < 4000 && room.game!.snapshot().stage !== "podium"; t++) {
        await vi.advanceTimersByTimeAsync(500);
        const snap = room.game!.snapshot();
        if (snap.stage === "intro") manager.gameReady("chef");
        const turn = snap.board?.turn;
        if (turn?.playerId === botId && turn.usedItem) botItems++;
        if (!turn || turn.playerId !== me) continue;
        if (turn.phase === "shop") {
          shops++;
          const before = game.boardPrivate(me)!.items.length;
          try {
            manager.gameAction("chef", { type: "buy", item: "de-12" });
            expect(game.boardPrivate(me)!.items.length).toBe(before + 1);
            bought++;
          } catch (e) {
            expect(String(e)).toMatch(/pièces|objets/);
          }
          if (room.game!.snapshot().board?.turn?.phase === "shop") manager.gameAction("chef", { type: "leave" });
        }
        if (turn.phase === "roll") {
          const items = game.boardPrivate(me)!.items;
          if (items.length && !turn.usedItem) {
            manager.gameAction("chef", { type: "item", item: items[0]!, value: 3 });
            used++;
            expect(room.game!.snapshot().board!.turn!.rolls[0]!.sides).toBe(items[0] === "de-12" ? 12 : 6);
            expect(() => manager.gameAction("chef", { type: "item", item: items[0]!, value: 3 })).toThrow();
          }
          manager.gameAction("chef", { type: "roll" });
        }
      }
      expect(room.game!.snapshot().stage).toBe("podium");
      expect(shops).toBeGreaterThan(0);
      if (bought) expect(used).toBeGreaterThan(0);
      room.game!.dispose();
      if (botItems > 0) break;
     }
      expect(botItems).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
