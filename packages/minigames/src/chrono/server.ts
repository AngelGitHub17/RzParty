import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { CHRONO_MARGIN_MS, CHRONO_READY_MS, CHRONO_RESULT_MS, CHRONO_ROUNDS, type ChronoInput, type ChronoState } from "./types.ts";

/** Pénalité pour qui n'arrête pas son chrono : comme s'il avait raté de 5 secondes. */
const NO_STOP_PENALTY = 5000;

export default defineMiniGame<ChronoState, null, ChronoInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: ChronoState = {
      round: 0,
      phase: "ready",
      target: 0,
      startedAt: 0,
      phaseEndsAt: 0,
      stops: null,
      stopped: [],
      totals: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    let stops: Record<string, number> = {};
    let gen = 0;
    const best: Record<string, number> = {};
    const publish = () => ctx.publish(structuredClone(state));

    const ready = () => {
      if (state.round >= CHRONO_ROUNDS) return end();
      state.round++;
      gen++;
      stops = {};
      state.phase = "ready";
      state.target = (5 + Math.floor(ctx.random() * 6)) * 1000 + (ctx.random() < 0.5 ? 500 : 0);
      state.stops = null;
      state.stopped = [];
      state.phaseEndsAt = ctx.now() + CHRONO_READY_MS;
      publish();
      const g = gen;
      ctx.schedule(CHRONO_READY_MS, () => {
        state.phase = "run";
        state.startedAt = ctx.now();
        state.phaseEndsAt = state.startedAt + state.target + CHRONO_MARGIN_MS;
        publish();
        ctx.schedule(state.target + CHRONO_MARGIN_MS, () => g === gen && result());
      });
    };

    const result = () => {
      if (state.phase !== "run") return;
      for (const id of ids) {
        const gap = id in stops ? Math.abs(stops[id]! - state.target) : NO_STOP_PENALTY;
        state.totals[id]! += gap;
        if (id in stops) best[id] = Math.min(best[id] ?? Infinity, gap);
      }
      state.phase = "result";
      state.stops = { ...stops };
      state.phaseEndsAt = ctx.now() + CHRONO_RESULT_MS;
      publish();
      ctx.schedule(CHRONO_RESULT_MS, ready);
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.totals[a]! - state.totals[b]!),
        Object.fromEntries(Object.entries(best).map(([id, v]) => [id, { ecart: Math.round(v) }])),
      );
    };

    return {
      start: ready,
      input(playerId, raw) {
        const input = raw as Partial<ChronoInput> | null;
        if (state.phase !== "run" || !ids.includes(playerId) || !input || input.round !== state.round || playerId in stops) return;
        const server = ctx.now() - state.startedAt;
        // Le temps mesuré par l'appareil est plus précis ; on le garde s'il reste plausible.
        const elapsed = typeof input.elapsed === "number" && Number.isFinite(input.elapsed) && input.elapsed <= server + 150 && input.elapsed >= server - 1500 ? input.elapsed : server;
        stops[playerId] = Math.round(elapsed);
        state.stopped.push(playerId);
        publish();
        if (ids.every((id) => id in stops)) ctx.schedule(300, result);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let played = 0;
    return {
      onState(state) {
        if (state.phase !== "run" || played === state.round) return;
        played = state.round;
        const error = gaussian(ctx.random, 0, (650 / skill.accuracy - 450) * (1 + skill.chaos));
        const at = Math.max(1000, state.target + error);
        const round = state.round;
        ctx.schedule(at, () => ctx.send({ round, elapsed: at }));
      },
    };
  },
});
