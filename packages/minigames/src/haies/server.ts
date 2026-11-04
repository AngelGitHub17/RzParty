import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { JUMP_MS, RACE_MAX_MS, RACE_READY_MS, RACE_RESULT_MS, STEP_MS, makeHurdles, simulateRun, validJumps, type HaiesInput, type HaiesState } from "./types.ts";

const GRACE_MS = 800;

export default defineMiniGame<HaiesState, null, HaiesInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: HaiesState = {
      phase: "ready",
      hurdles: makeHurdles(ctx.random),
      startedAt: 0,
      phaseEndsAt: 0,
      jumps: Object.fromEntries(ids.map((id) => [id, []])),
      finished: {},
    };
    let dirty = false;
    const publish = () => {
      dirty = false;
      ctx.publish(structuredClone(state));
    };

    const check = (force: boolean) => {
      if (state.phase !== "run") return;
      const elapsed = ctx.now() - state.startedAt;
      for (const id of ids) {
        if (state.finished[id]) continue;
        const r = simulateRun(state.hurdles, state.jumps[id]!, elapsed);
        if ((r.finishedAt !== null && elapsed >= r.finishedAt + GRACE_MS) || force) {
          state.finished[id] = { time: r.finishedAt, hits: r.hit.length };
          dirty = true;
        }
      }
      if (ids.every((id) => state.finished[id])) end();
    };

    const end = () => {
      state.phase = "result";
      state.phaseEndsAt = ctx.now() + RACE_RESULT_MS;
      publish();
      ctx.schedule(RACE_RESULT_MS, () => {
        state.phase = "done";
        publish();
        const time = (id: string) => state.finished[id]?.time ?? Infinity;
        ctx.finish(
          rankBy(ids, (id) => id, (a, b) => (time(a) === time(b) ? 0 : time(a) - time(b))),
          Object.fromEntries(ids.filter((id) => Number.isFinite(time(id))).map((id) => [id, { temps: Math.round(time(id) / 10) / 100 }])),
        );
      });
    };

    return {
      start() {
        state.phaseEndsAt = ctx.now() + RACE_READY_MS;
        publish();
        ctx.schedule(RACE_READY_MS, () => {
          state.phase = "run";
          state.startedAt = ctx.now();
          state.phaseEndsAt = state.startedAt + RACE_MAX_MS;
          publish();
          const tick = () => {
            check(false);
            if (dirty) publish();
            if (state.phase === "run") ctx.schedule(250, tick);
          };
          ctx.schedule(250, tick);
          ctx.schedule(RACE_MAX_MS + GRACE_MS, () => check(true));
        });
      },
      input(playerId, raw) {
        const input = raw as Partial<HaiesInput> | null;
        if (state.phase !== "run" || !ids.includes(playerId) || !input || state.finished[playerId] || !validJumps(input.jumps)) return;
        const old = state.jumps[playerId]!;
        const next = input.jumps;
        if (next.length < old.length || old.some((v, i) => next[i] !== v)) return;
        const elapsed = ctx.now() - state.startedAt;
        if (next.slice(old.length).some((v) => v > elapsed + 150 || v < elapsed - 1500)) return;
        state.jumps[playerId] = [...next];
        dirty = true;
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let planned = false;
    return {
      onState(state) {
        if (state.phase !== "run" || planned) return;
        planned = true;
        // Le bot prévoit ses sauts haie après haie, avec plus ou moins de justesse.
        const jumps: number[] = [];
        state.hurdles.forEach((_, i) => {
          const cross = simulateRun(state.hurdles, jumps, RACE_MAX_MS).cross[i];
          if (cross === undefined) return;
          const ideal = cross - JUMP_MS / 2;
          const spread = 30 + (1 - skill.accuracy) * 500 + skill.chaos * 120;
          const at = Math.max((jumps.at(-1) ?? -JUMP_MS) + JUMP_MS + STEP_MS, Math.round(gaussian(ctx.random, ideal, spread) / STEP_MS) * STEP_MS);
          jumps.push(Math.max(0, at));
        });
        const sent: number[] = [];
        for (const t of jumps) ctx.schedule(t + 30, () => (sent.push(t), ctx.send({ jumps: [...sent] })));
      },
    };
  },
});
