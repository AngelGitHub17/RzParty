import { gaussian, shuffled } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, tipCheater } from "../contract.ts";
import { definition } from "./definition.ts";
import { SHADOW_ASK_MS, SHADOW_POINTS, SHADOW_REVEAL_MS, SHADOW_ROUNDS, SHADOW_THINGS, type OmbresInput, type OmbresState } from "./types.ts";

export default defineMiniGame<OmbresState, null, OmbresInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: OmbresState = { round: 0, phase: "ask", phaseEndsAt: 0, shadow: null, tilt: 0, mirror: false, choices: [], answer: null, correct: [], wrong: [], scores: Object.fromEntries(ids.map((id) => [id, 0])) };
    const deck = shuffled(ctx.random, SHADOW_THINGS.map((_, i) => i));
    let answer = 0;
    let gen = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const ask = () => {
      if (state.round >= SHADOW_ROUNDS) return end();
      state.round++;
      gen++;
      const thing = deck[(state.round - 1) % deck.length]!;
      const others = shuffled(ctx.random, SHADOW_THINGS.map((_, i) => i).filter((i) => i !== thing)).slice(0, 3);
      state.choices = shuffled(ctx.random, [thing, ...others]);
      answer = state.choices.indexOf(thing);
      Object.assign(state, {
        phase: "ask",
        shadow: thing,
        // Plus on avance, plus l'ombre est penchée (et parfois retournée).
        tilt: Math.round((ctx.random() - 0.5) * Math.min(70, state.round * 12)),
        mirror: state.round > 3 && ctx.random() < 0.5,
        answer: null,
        correct: [],
        wrong: [],
        phaseEndsAt: ctx.now() + SHADOW_ASK_MS,
      });
      publish();
      tipCheater(ctx, `C'est la proposition n°${answer + 1} (${SHADOW_THINGS[thing]})`);
      const g = gen;
      ctx.schedule(SHADOW_ASK_MS, () => g === gen && reveal());
    };

    const reveal = () => {
      if (state.phase !== "ask") return;
      state.phase = "reveal";
      state.answer = answer;
      state.phaseEndsAt = ctx.now() + SHADOW_REVEAL_MS;
      publish();
      ctx.schedule(SHADOW_REVEAL_MS, ask);
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]!));
    };

    return {
      start: ask,
      input(playerId, raw) {
        const input = raw as Partial<OmbresInput> | null;
        if (state.phase !== "ask" || !ids.includes(playerId) || !input || input.round !== state.round) return;
        if (state.correct.includes(playerId) || state.wrong.includes(playerId)) return;
        if (typeof input.pick !== "number" || input.pick < 0 || input.pick >= state.choices.length) return;
        if (input.pick === answer) {
          state.scores[playerId]! += state.correct.length === 0 ? SHADOW_POINTS.first : SHADOW_POINTS.other;
          state.correct.push(playerId);
        } else state.wrong.push(playerId);
        publish();
        if (ids.every((id) => state.correct.includes(id) || state.wrong.includes(id))) ctx.schedule(400, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let played = 0;
    return {
      onState(state) {
        if (state.phase !== "ask" || played === state.round || state.shadow === null) return;
        played = state.round;
        const round = state.round;
        const right = state.choices.indexOf(state.shadow);
        // Les ombres penchées ou retournées font hésiter (et se tromper) davantage.
        const hard = Math.abs(state.tilt) / 70 + (state.mirror ? 0.3 : 0);
        const ok = ctx.random() < skill.accuracy - hard * 0.25;
        const pick = ok ? right : (right + 1 + Math.floor(ctx.random() * 3)) % 4;
        const wait = Math.max(700, gaussian(ctx.random, (2200 + hard * 1500) / skill.speed, 500 + skill.chaos * 900));
        ctx.schedule(Math.min(wait, 6500), () => ctx.send({ round, pick }));
      },
    };
  },
});
