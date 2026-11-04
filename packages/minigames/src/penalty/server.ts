import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { AIM_MS, GAUGE_PERIOD_MS, GOLD, SHOTS, SHOT_RESULT_MS, gauge, shotOutcome, type Dir, type PenaltyInput, type PenaltyState } from "./types.ts";


export default defineMiniGame<PenaltyState, null, PenaltyInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: PenaltyState = {
      shot: 0,
      shots: SHOTS,
      phase: "aim",
      startedAt: 0,
      phaseEndsAt: 0,
      shot_done: [],
      results: null,
      history: Object.fromEntries(ids.map((id) => [id, []])),
      goals: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    let aims: Record<string, { dir: Dir; power: number }> = {};
    let perfect: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let gen = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const aim = () => {
      gen++;
      state.shot++;
      state.phase = "aim";
      state.results = null;
      state.shot_done = [];
      aims = {};
      state.startedAt = ctx.now();
      state.phaseEndsAt = state.startedAt + AIM_MS;
      publish();
      const g = gen;
      ctx.schedule(AIM_MS, () => g === gen && reveal());
    };

    const reveal = () => {
      if (state.phase !== "aim") return;
      gen++;
      const results: PenaltyState["results"] = {};
      for (const id of ids) {
        const a = aims[id];
        // Le gardien plonge au hasard, un peu plus souvent sur les côtés.
        const r = ctx.random();
        const keeper: Dir = r < 0.4 ? 0 : r < 0.6 ? 1 : 2;
        const outcome = shotOutcome(a?.power ?? null, a?.dir ?? null, keeper);
        results[id] = { dir: a?.dir ?? null, power: a?.power ?? null, keeper, outcome };
        state.history[id]!.push(outcome);
        if (outcome === "but") state.goals[id]!++;
        if (a && a.power >= GOLD[0] && a.power <= GOLD[1]) perfect[id]!++;
      }
      state.results = results;
      state.phase = "result";
      state.phaseEndsAt = ctx.now() + SHOT_RESULT_MS;
      publish();
      ctx.schedule(SHOT_RESULT_MS, () => (state.shot >= SHOTS ? end() : aim()));
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.goals[b]! - state.goals[a]! || perfect[b]! - perfect[a]!),
        Object.fromEntries(ids.map((id) => [id, { buts: state.goals[id]! }])),
      );
    };

    return {
      start: aim,
      input(playerId, raw) {
        const input = raw as Partial<PenaltyInput> | null;
        if (state.phase !== "aim" || !ids.includes(playerId) || !input || input.shot !== state.shot || playerId in aims) return;
        if (input.dir !== 0 && input.dir !== 1 && input.dir !== 2) return;
        if (typeof input.t !== "number" || !Number.isFinite(input.t) || input.t < 0) return;
        // Temps de l'appareil, borné par ce que le serveur juge possible (latence comprise).
        const elapsed = ctx.now() - state.startedAt;
        if (input.t > elapsed + 150 || input.t < elapsed - 1500) return;
        aims[playerId] = { dir: input.dir, power: gauge(input.t) };
        state.shot_done.push(playerId);
        publish();
        if (ids.every((id) => id in aims)) ctx.schedule(400, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let played = 0;
    return {
      onState(state) {
        if (state.phase !== "aim" || played === state.shot) return;
        played = state.shot;
        const shot = state.shot;
        // Vise le centre de la zone dorée sur une montée de la jauge, avec plus ou moins de précision.
        const climbs = 1 + Math.floor(ctx.random() * 2);
        const ideal = (climbs - 1) * GAUGE_PERIOD_MS + ((GOLD[0] + GOLD[1]) / 4) * GAUGE_PERIOD_MS;
        const spread = (1 - skill.accuracy) * 900 + skill.chaos * 160 + 25;
        const t = Math.max(80, gaussian(ctx.random, ideal, spread));
        const dir = Math.floor(ctx.random() * 3) as Dir;
        const delay = t;
        ctx.schedule(delay, () => ctx.send({ shot, dir, t: Math.round(t) }));
      },
    };
  },
});
