import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, tipCheater } from "../contract.ts";
import { definition } from "./definition.ts";
import { FLAVORS, ICE_BUILD_MS, ICE_FIRST, ICE_POINTS, ICE_REVEAL_MS, ICE_ROUNDS, iceShowMs, type GlacesInput, type GlacesState } from "./types.ts";

export default defineMiniGame<GlacesState, null, GlacesInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: GlacesState = { round: 0, phase: "show", phaseEndsAt: 0, order: null, size: ICE_FIRST, correct: [], wrong: [], scores: Object.fromEntries(ids.map((id) => [id, 0])) };
    let order: number[] = [];
    let gen = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const show = () => {
      if (state.round >= ICE_ROUNDS) return end();
      state.round++;
      gen++;
      const size = ICE_FIRST + state.round - 1;
      // Jamais deux fois le même parfum à la suite (plus lisible).
      order = [];
      while (order.length < size) {
        const f = Math.floor(ctx.random() * FLAVORS.length);
        if (f !== order.at(-1)) order.push(f);
      }
      Object.assign(state, { phase: "show", order: [...order], size, correct: [], wrong: [], phaseEndsAt: ctx.now() + iceShowMs(size) });
      publish();
      const g = gen;
      ctx.schedule(iceShowMs(size), () => {
        if (g !== gen) return;
        Object.assign(state, { phase: "build", order: null, phaseEndsAt: ctx.now() + ICE_BUILD_MS });
        publish();
        tipCheater(ctx, `De bas en haut : ${order.map((f) => FLAVORS[f]!.label).join(", ")}`);
        ctx.schedule(ICE_BUILD_MS, () => g === gen && reveal());
      });
    };

    const reveal = () => {
      if (state.phase !== "build") return;
      Object.assign(state, { phase: "reveal", order: [...order], phaseEndsAt: ctx.now() + ICE_REVEAL_MS });
      publish();
      ctx.schedule(ICE_REVEAL_MS, show);
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]!));
    };

    return {
      start: show,
      input(playerId, raw) {
        const input = raw as Partial<GlacesInput> | null;
        if (state.phase !== "build" || !ids.includes(playerId) || !input || input.round !== state.round) return;
        if (state.correct.includes(playerId) || state.wrong.includes(playerId)) return;
        const scoops = input.scoops;
        if (!Array.isArray(scoops) || scoops.length !== order.length || !scoops.every((f) => Number.isInteger(f) && f >= 0 && f < FLAVORS.length)) return;
        if (scoops.every((f, i) => f === order[i])) {
          state.scores[playerId]! += ICE_POINTS[state.correct.length] ?? 1;
          state.correct.push(playerId);
        } else state.wrong.push(playerId);
        publish();
        if (ids.every((id) => state.correct.includes(id) || state.wrong.includes(id))) ctx.schedule(400, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let seen: number[] = [];
    let played = 0;
    return {
      onState(state) {
        if (state.phase === "show" && state.order) seen = [...state.order];
        if (state.phase !== "build" || played === state.round) return;
        played = state.round;
        const round = state.round;
        // Plus la commande est longue, plus le bot risque d'intervertir deux boules.
        const scoops = [...seen];
        if (ctx.random() > skill.accuracy - (scoops.length - 3) * 0.08 && scoops.length > 1) {
          const i = Math.floor(ctx.random() * (scoops.length - 1));
          [scoops[i], scoops[i + 1]] = [scoops[i + 1]!, scoops[i]!];
          if (scoops[i] === scoops[i + 1]) scoops[i] = (scoops[i]! + 1) % 6;
        }
        const wait = Math.max(1200, gaussian(ctx.random, (1500 + scoops.length * 650) / skill.speed, 500 + skill.chaos * 1200));
        ctx.schedule(Math.min(wait, ICE_BUILD_MS - 400), () => ctx.send({ round, scoops }));
      },
    };
  },
});
