import { describe, expect, it } from "vitest";
import { BOARD_SIZES, applySettingsPatch, defaultCustomConfig, defaultSettings, distancesToFinish, forkChoices, generateBoard, patchConfig, type BoardSize } from "@rzparty/shared";

describe("générateur de plateau", () => {
  for (const size of (Object.keys(BOARD_SIZES) as BoardSize[]).filter((s) => s !== "perso")) {
    for (const seed of [1, 7, 42, 1234, 99999]) {
      it(`${size} (graine ${seed}) : connexe, sans chevauchement, avec des détours`, () => {
        const board = generateBoard(seed, size);
        const dist = distancesToFinish(board);
        // Chaque case mène à l'arrivée et est atteignable depuis le départ.
        expect(dist.every((d) => Number.isFinite(d))).toBe(true);
        const seen = new Set([board.start]);
        const stack = [board.start];
        while (stack.length) for (const n of board.cells[stack.pop()!]!.next) if (!seen.has(n)) (seen.add(n), stack.push(n));
        expect(seen.size).toBe(board.cells.length);
        // Le chemin principal a la longueur demandée.
        expect(dist[board.start]).toBe(BOARD_SIZES[size].cells - 1);
        // Les cases ne se chevauchent pas.
        for (const a of board.cells) for (const b of board.cells) {
          if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.z - b.z), `cases ${a.id} et ${b.id}`).toBeGreaterThan(0.95);
        }
        // Des embranchements, 3 à 5 dès la taille moyenne, et des détours plus longs.
        expect(board.forks.length).toBeLessThanOrEqual(5);
        if (size !== "court") expect(board.forks.length).toBeGreaterThanOrEqual(3);
        else expect(board.forks.length).toBeGreaterThanOrEqual(2);
        for (const f of board.forks) {
          expect(f.detourLength).toBeGreaterThan(f.mainLength);
          expect(forkChoices(board, f.at)).toHaveLength(2);
        }
        // Variété : jamais deux cases spéciales identiques à la suite, au plus 2 cases calmes d'affilée.
        for (const c of board.cells) for (const n of c.next) {
          const d = board.cells[n]!;
          if (c.type !== "vide") expect(d.type, `cases ${c.id} → ${n}`).not.toBe(c.type);
        }
        for (let i = 5; i < board.finish - 2; i++) {
          expect([i - 2, i - 1, i].every((j) => board.cells[j]!.type === "vide"), `3 cases calmes jusqu'à ${i}`).toBe(false);
        }
        expect(board.cells[board.start]!.type).toBe("depart");
        expect(board.cells[board.finish]!.type).toBe("arrivee");
      });
    }
  }

  it("personnalisé : que des cases rouges, sans variété", () => {
    const config = patchConfig(defaultCustomConfig(), { length: 60, weights: { vide: 0, bonus: 0, malus: 100, piege: 0, boutique: 0, ovni: 0, duel: 0, evenement: 0 }, forks: 0 });
    const board = generateBoard(3, "perso", config);
    const inner = board.cells.filter((c) => c.id > config.malusSteps && c.id < board.finish - 1);
    expect(inner.every((c) => c.type === "malus")).toBe(true);
    expect(board.forks).toHaveLength(0);
    expect(distancesToFinish(board)[board.start]).toBe(59);
  });

  it("personnalisé : 2000 cases générées rapidement, avec beaucoup d'embranchements", () => {
    const config = patchConfig(defaultCustomConfig(), { length: 2000, forks: 40 });
    const t = performance.now();
    const board = generateBoard(8, "perso", config);
    const dist = distancesToFinish(board);
    expect(performance.now() - t).toBeLessThan(3000);
    expect(dist[board.start]).toBe(1999);
    expect(board.forks.length).toBeGreaterThanOrEqual(30);
    expect(board.cells.some((c) => c.type === "boutique")).toBe(true);
    // Le plateau reste raisonnable à envoyer sur le réseau.
    expect(JSON.stringify(board).length).toBeLessThan(250_000);
  });

  it("les réglages personnalisés sont bornés et validés", () => {
    const s = applySettingsPatch(defaultSettings(), { board: { size: "perso", custom: { length: 999999, bonusSteps: -3, weights: { malus: 500, lave: 50 }, doubles: "oui", maxItems: 2.6 } } });
    expect(s.board.size).toBe("perso");
    expect(s.board.custom.length).toBe(2000);
    expect(s.board.custom.bonusSteps).toBe(1);
    expect(s.board.custom.weights.malus).toBe(100);
    expect((s.board.custom.weights as Record<string, number>).lave).toBeUndefined();
    expect(s.board.custom.doubles).toBe(true);
    expect(s.board.custom.maxItems).toBe(3);
    const empty = patchConfig(defaultCustomConfig(), { weights: { vide: 0, bonus: 0, malus: 0, piege: 0, boutique: 0, ovni: 0, duel: 0, evenement: 0 } });
    expect(empty.weights.vide).toBe(1);
  });

  it("même graine, même plateau", () => {
    expect(generateBoard(5, "long")).toEqual(generateBoard(5, "long"));
  });
});
