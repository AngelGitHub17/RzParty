import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng, INTRUS_GAMES } from "@rzparty/shared";
import { getMiniGame } from "@rzparty/minigames/server";
import { MiniGameRunner } from "../src/game/MiniGameRunner.ts";

const players = [
  { id: "a", name: "Anna", color: 0 },
  { id: "b", name: "Bob", color: 1 },
  { id: "c", name: "Cléo", color: 2 },
];

describe("L'intrus : coups de pouce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  for (const id of INTRUS_GAMES) {
    it(`${id} : l'intrus (et lui seul) reçoit au moins un coup de pouce`, async () => {
      const module = getMiniGame(id)!;
      expect(module).toBeTruthy();
      const tips: { to: string; text: string }[] = [];
      const runner = new MiniGameRunner({
        module,
        players,
        // Les deux autres sont des bots : ils jouent, l'intrus aussi (on simule ses choix au hasard).
        bots: new Map([["b", { personality: "equilibre", difficulty: "moyen" }], ["c", { personality: "equilibre", difficulty: "moyen" }]]),
        random: createRng(7),
        now: () => Date.now(),
        publish: () => {},
        sendTo: () => {},
        cheater: "a",
        whisper: (to, text) => tips.push({ to, text }),
      });
      let done = false;
      void runner.result.then(() => (done = true));
      runner.start();
      // Escalier : les coups de pouce arrivent quand les autres choisissent.
      for (let t = 0; t < 400 && !done && !tips.length; t++) await vi.advanceTimersByTimeAsync(250);
      expect(tips.length).toBeGreaterThan(0);
      for (const tip of tips) {
        expect(tip.to).toBe("a");
        expect(tip.text.length).toBeGreaterThan(3);
      }
    }, 30_000);
  }
});
