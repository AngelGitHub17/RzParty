import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { MAX_STEP_ROUNDS, STAIRS, STEP_CHOICE_MS, STEP_REVEAL_MS, type EscalierInput, type EscalierState } from "./types.ts";

export default defineMiniGame<EscalierState, null, EscalierInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: EscalierState = {
      round: 0,
      phase: "choose",
      phaseEndsAt: 0,
      heights: Object.fromEntries(ids.map((id) => [id, 0])),
      chosen: [],
      picks: null,
      blocked: [],
    };
    let picks: Record<string, number> = {};
    let gen = 0;
    const reachedAt: Record<string, number> = {};
    const publish = () => ctx.publish(structuredClone(state));

    const choose = () => {
      state.round++;
      gen++;
      picks = {};
      state.phase = "choose";
      state.chosen = [];
      state.picks = null;
      state.blocked = [];
      state.phaseEndsAt = ctx.now() + STEP_CHOICE_MS;
      publish();
      const g = gen;
      ctx.schedule(STEP_CHOICE_MS, () => g === gen && reveal());
    };

    const reveal = () => {
      if (state.phase !== "choose") return;
      // Qui n'a pas choisi monte d'une marche… sauf si c'est aussi le choix de quelqu'un d'autre.
      for (const id of ids) if (!(id in picks)) picks[id] = 1;
      const count = new Map<number, number>();
      for (const v of Object.values(picks)) count.set(v, (count.get(v) ?? 0) + 1);
      state.blocked = ids.filter((id) => count.get(picks[id]!)! > 1);
      for (const id of ids) {
        if (state.blocked.includes(id)) continue;
        state.heights[id] = Math.min(STAIRS, state.heights[id]! + picks[id]!);
        if (state.heights[id] === STAIRS && !(id in reachedAt)) reachedAt[id] = state.round;
      }
      state.phase = "reveal";
      state.picks = { ...picks };
      state.phaseEndsAt = ctx.now() + STEP_REVEAL_MS;
      publish();
      const done = Object.keys(reachedAt).length > 0 || state.round >= MAX_STEP_ROUNDS;
      ctx.schedule(STEP_REVEAL_MS, () => (done ? end() : choose()));
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(rankBy(ids, (id) => id, (a, b) => state.heights[b]! - state.heights[a]!));
    };

    return {
      start: choose,
      input(playerId, raw) {
        const input = raw as Partial<EscalierInput> | null;
        if (state.phase !== "choose" || !ids.includes(playerId) || !input || input.round !== state.round) return;
        if (input.steps !== 1 && input.steps !== 2 && input.steps !== 3) return;
        if (!(playerId in picks)) state.chosen.push(playerId);
        picks[playerId] = input.steps;
        publish();
        if (ids.every((id) => id in picks)) ctx.schedule(500, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let played = 0;
    const history: number[][] = [];
    return {
      onState(state) {
        if (state.phase === "reveal" && state.picks && history.length < state.round) history.push(Object.values(state.picks));
        if (state.phase !== "choose" || played === state.round) return;
        played = state.round;
        // Un bot malin évite le nombre le plus joué à la manche d'avant ; près du sommet, il vise juste.
        const left = 12 - (state.heights[ctx.player.id] ?? 0);
        const last = history.at(-1) ?? [];
        const popular = [1, 2, 3].sort((a, b) => last.filter((v) => v === b).length - last.filter((v) => v === a).length)[0];
        let steps = 1 + Math.floor(ctx.random() * 3);
        if (ctx.random() < skill.accuracy * 0.6 && steps === popular) steps = ((steps % 3) + 1) as 1 | 2 | 3;
        if (left <= 3 && ctx.random() < skill.accuracy * 0.5) steps = left;
        const round = state.round;
        ctx.schedule(Math.max(600, gaussian(ctx.random, 2600 / skill.speed, 600 + skill.chaos * 1500)), () => ctx.send({ round, steps: steps as 1 | 2 | 3 }));
      },
    };
  },
});
