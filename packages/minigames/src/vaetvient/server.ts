import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { pointsFor } from "../coupdoeil/types.ts";
import { definition } from "./definition.ts";
import { VV_ANSWER_MS, VV_INTRO_MS, VV_REVEAL_MS, VV_ROUNDS, type VVInput, type VVState } from "./types.ts";

export default defineMiniGame<VVState, null, VVInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: VVState = {
      round: 0,
      phase: "intro",
      phaseEndsAt: 0,
      start: 0,
      move: null,
      inside: null,
      answered: [],
      answers: null,
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    let answers: Record<string, number> = {};
    let inside = 0;
    let gen = 0;
    let moveId = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const intro = () => {
      if (state.round >= VV_ROUNDS) return end();
      state.round++;
      gen++;
      answers = {};
      inside = 1 + Math.floor(ctx.random() * 4);
      state.phase = "intro";
      state.start = inside;
      state.move = null;
      state.inside = null;
      state.answers = null;
      state.answered = [];
      state.phaseEndsAt = ctx.now() + VV_INTRO_MS;
      publish();
      // Plus de mouvements, plus rapides, à chaque manche.
      const moves = 9 + state.round * 4;
      const pace = Math.max(420, 900 - state.round * 150);
      const g = gen;
      let left = moves;
      const step = () => {
        if (g !== gen) return;
        if (left-- <= 0) return ask();
        const out = inside > 0 && (inside >= 9 || ctx.random() < 0.45);
        const count = Math.min(out ? inside : 9, ctx.random() < 0.25 ? 2 : 1);
        inside += out ? -count : count;
        state.phase = "moves";
        state.move = { id: moveId++, dir: out ? "out" : "in", count };
        publish();
        ctx.schedule(pace * (0.7 + ctx.random() * 0.6), step);
      };
      ctx.schedule(VV_INTRO_MS, step);
    };

    const ask = () => {
      state.phase = "answer";
      state.move = null;
      state.phaseEndsAt = ctx.now() + VV_ANSWER_MS;
      publish();
      const g = gen;
      ctx.schedule(VV_ANSWER_MS, () => g === gen && reveal());
    };

    const reveal = () => {
      if (state.phase !== "answer") return;
      for (const id of ids) state.scores[id]! += pointsFor(answers[id], inside);
      state.phase = "reveal";
      state.inside = inside;
      state.answers = { ...answers };
      state.phaseEndsAt = ctx.now() + VV_REVEAL_MS;
      publish();
      ctx.schedule(VV_REVEAL_MS, intro);
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]!),
        Object.fromEntries(ids.map((id) => [id, { points: state.scores[id]! }])),
      );
    };

    return {
      start: intro,
      input(playerId, raw) {
        const input = raw as Partial<VVInput> | null;
        if (state.phase !== "answer" || !ids.includes(playerId) || !input || input.round !== state.round || playerId in answers) return;
        if (!Number.isInteger(input.answer) || input.answer! < 0 || input.answer! > 99) return;
        answers[playerId] = input.answer!;
        state.answered.push(playerId);
        publish();
        if (ids.every((id) => id in answers)) ctx.schedule(400, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let count = 0;
    let round = 0;
    let lastMove = -1;
    let answered = 0;
    return {
      onState(state) {
        if (state.round !== round) {
          round = state.round;
          count = state.start;
        }
        // Le bot compte… et se trompe parfois.
        if (state.move && state.move.id !== lastMove) {
          lastMove = state.move.id;
          const miss = ctx.random() > skill.accuracy * 0.985;
          if (!miss) count += state.move.dir === "in" ? state.move.count : -state.move.count;
        }
        if (state.phase === "answer" && answered !== state.round) {
          answered = state.round;
          const r = state.round;
          const answer = Math.max(0, count);
          ctx.schedule(Math.max(800, gaussian(ctx.random, 2400 / skill.speed, 500 + skill.chaos * 1200)), () => ctx.send({ round: r, answer }));
        }
      },
    };
  },
});
