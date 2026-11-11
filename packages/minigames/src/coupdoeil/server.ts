import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, tipCheater } from "../contract.ts";
import { definition } from "./definition.ts";
import { EYE_ANSWER_MS, EYE_REVEAL_MS, EYE_ROUNDS, EYE_SHOW_MS, SHAPES, pointsFor, type EyeInput, type EyeState, type Shape } from "./types.ts";

export default defineMiniGame<EyeState, null, EyeInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: EyeState = {
      round: 0,
      phase: "show",
      phaseEndsAt: 0,
      shapes: null,
      ask: "etoile",
      count: null,
      answered: [],
      answers: null,
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    let answers: Record<string, number> = {};
    let shapes: Shape[] = [];
    const speed: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let answerStart = 0;
    let gen = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const makeField = () => {
      const total = 12 + state.round * 3 + Math.floor(ctx.random() * 4);
      const placed: Shape[] = [];
      for (let i = 0; i < total; i++) {
        // On évite que les formes se chevauchent trop.
        let x = 0, y = 0;
        for (let t = 0; t < 30; t++) {
          x = 6 + ctx.random() * 88;
          y = 8 + ctx.random() * 84;
          if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > 9)) break;
        }
        placed.push({ kind: SHAPES[Math.floor(ctx.random() * SHAPES.length)]!, x, y, color: Math.floor(ctx.random() * 6), size: 0.8 + ctx.random() * 0.5 });
      }
      return placed;
    };

    const nextRound = () => {
      if (state.round >= EYE_ROUNDS) return end();
      state.round++;
      gen++;
      shapes = makeField();
      state.ask = SHAPES[Math.floor(ctx.random() * SHAPES.length)]!;
      // Au moins 2 formes demandées.
      while (shapes.filter((s) => s.kind === state.ask).length < 2) shapes[Math.floor(ctx.random() * shapes.length)]!.kind = state.ask;
      answers = {};
      state.phase = "show";
      state.shapes = shapes;
      state.count = null;
      state.answers = null;
      state.answered = [];
      state.phaseEndsAt = ctx.now() + EYE_SHOW_MS;
      publish();
      const g = gen;
      ctx.schedule(EYE_SHOW_MS, () => {
        state.phase = "answer";
        tipCheater(ctx, `La bonne réponse : ${shapes.filter((s) => s.kind === state.ask).length}`);
        state.shapes = null;
        answerStart = ctx.now();
        state.phaseEndsAt = answerStart + EYE_ANSWER_MS;
        publish();
        ctx.schedule(EYE_ANSWER_MS, () => g === gen && reveal());
      });
    };

    const reveal = () => {
      if (state.phase !== "answer") return;
      const count = shapes.filter((s) => s.kind === state.ask).length;
      for (const id of ids) state.scores[id]! += pointsFor(answers[id], count);
      state.phase = "reveal";
      state.count = count;
      state.answers = { ...answers };
      state.shapes = shapes;
      state.phaseEndsAt = ctx.now() + EYE_REVEAL_MS;
      publish();
      ctx.schedule(EYE_REVEAL_MS, nextRound);
    };

    const end = () => {
      state.phase = "done";
      state.shapes = null;
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]! || (state.scores[a] ? speed[a]! - speed[b]! : 0)),
        Object.fromEntries(ids.map((id) => [id, { points: state.scores[id]! }])),
      );
    };

    return {
      start() {
        nextRound();
      },
      input(playerId, raw) {
        const input = raw as Partial<EyeInput> | null;
        if (state.phase !== "answer" || !ids.includes(playerId) || !input || input.round !== state.round) return;
        if (playerId in answers || !Number.isInteger(input.answer) || input.answer! < 0 || input.answer! > 99) return;
        answers[playerId] = input.answer!;
        speed[playerId]! += ctx.now() - answerStart;
        state.answered.push(playerId);
        publish();
        if (ids.every((id) => id in answers)) ctx.schedule(400, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let field: { round: number; count: number } | null = null;
    let answeredRound = 0;
    return {
      onState(state) {
        // Le bot « regarde » les formes pendant qu'elles sont affichées.
        if (state.phase === "show" && state.shapes && field?.round !== state.round) {
          field = { round: state.round, count: state.shapes.filter((s) => s.kind === state.ask).length };
        }
        if (state.phase === "answer" && field?.round === state.round && answeredRound !== state.round) {
          answeredRound = state.round;
          const roll = ctx.random();
          const exact = roll < skill.accuracy * 0.75;
          const off = roll < skill.accuracy * 0.97 ? 1 : 2;
          const answer = Math.max(0, exact ? field.count : field.count + (ctx.random() < 0.5 ? -off : off));
          const round = state.round;
          ctx.schedule(Math.max(900, gaussian(ctx.random, 2600 / skill.speed, 400 + skill.chaos * 1200)), () => ctx.send({ round, answer }));
        }
      },
    };
  },
});
