import { createRng, gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { PUZZLE_CHOICES, PUZZLE_MS, PUZZLE_PENALTY_MS, makeCard, type PuzzleCard, type PuzzleInput, type PuzzlePrivate, type PuzzleState } from "./types.ts";

export default defineMiniGame<PuzzleState, PuzzlePrivate, PuzzleInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: PuzzleState = {
      endsAt: 0,
      solved: Object.fromEntries(ids.map((id) => [id, 0])),
      lockedUntil: {},
      finished: false,
    };
    // La même suite de puzzles pour tout le monde.
    const seed = Math.floor(ctx.random() * 2 ** 31);
    const cards: { card: PuzzleCard; answer: number }[] = [];
    const rng = createRng(seed);
    const cardAt = (i: number) => {
      while (cards.length <= i) cards.push(makeCard(cards.length, rng));
      return cards[i]!;
    };
    const lastSolve: Record<string, number> = {};
    const publish = () => ctx.publish(structuredClone(state));
    const send = (id: string, last: PuzzlePrivate["last"]) => ctx.sendTo(id, { card: state.finished ? null : cardAt(state.solved[id]!).card, last });

    return {
      start() {
        state.endsAt = ctx.now() + PUZZLE_MS;
        publish();
        for (const id of ids) send(id, null);
        ctx.schedule(PUZZLE_MS, () => {
          state.finished = true;
          publish();
          for (const id of ids) send(id, null);
          ctx.finish(
            rankBy(ids, (id) => id, (a, b) => state.solved[b]! - state.solved[a]! || (lastSolve[a] ?? Infinity) - (lastSolve[b] ?? Infinity)),
            Object.fromEntries(ids.map((id) => [id, { puzzles: state.solved[id]! }])),
          );
        });
      },
      input(playerId, raw) {
        const input = raw as Partial<PuzzleInput> | null;
        if (state.finished || !ids.includes(playerId) || !input) return;
        if (!Number.isInteger(input.choice) || input.choice! < 0 || input.choice! >= PUZZLE_CHOICES) return;
        if (input.index !== state.solved[playerId] || (state.lockedUntil[playerId] ?? 0) > ctx.now()) return;
        const { answer } = cardAt(state.solved[playerId]!);
        if (input.choice === answer) {
          state.solved[playerId]!++;
          lastSolve[playerId] = ctx.now();
          send(playerId, "ok");
        } else {
          state.lockedUntil[playerId] = ctx.now() + PUZZLE_PENALTY_MS;
          send(playerId, "ko");
        }
        publish();
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let current = -1;
    return {
      onState() {},
      onPrivate(data) {
        if (!data.card || data.card.index === current && data.last !== "ko") return;
        current = data.card.index;
        const card = data.card;
        const answer = card.choices.findIndex((c) => JSON.stringify(c) === JSON.stringify(card.left));
        const wrong = ctx.random() > skill.accuracy * 0.95;
        const choice = wrong ? (answer + 1 + Math.floor(ctx.random() * 3)) % 4 : answer;
        const delay = Math.max(700, gaussian(ctx.random, 2400 / skill.speed, 500 + skill.chaos * 1200)) + (data.last === "ko" ? 1500 : 0);
        ctx.schedule(delay, () => ctx.send({ index: card.index, choice }));
      },
    };
  },
});
