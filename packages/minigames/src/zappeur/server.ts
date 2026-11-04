import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { CHANNELS, ZAP_READY_MS, ZAP_RESULT_MS, ZAP_ROUNDS, ZAP_TARGET_MS, type ZappeurInput, type ZappeurState } from "./types.ts";

export default defineMiniGame<ZappeurState, null, ZappeurInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: ZappeurState = {
      round: 0,
      rounds: ZAP_ROUNDS,
      phase: "ready",
      phaseEndsAt: 0,
      target: 0,
      zapIndex: -1,
      zap: null,
      locked: [],
      found: [],
      times: null,
      winner: null,
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    const zaps: { channel: number; at: number }[] = [];
    let targetZap = -1;
    let times: Record<string, number> = {};
    const totalTime: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const best: Record<string, number> = {};
    let gen = 0;
    const publish = () => ctx.publish(structuredClone(state));
    const pick = (not: number[]) => {
      const free = CHANNELS.map((_, i) => i).filter((i) => !not.includes(i));
      return free[Math.floor(ctx.random() * free.length)]!;
    };

    const ready = () => {
      gen++;
      state.round++;
      state.phase = "ready";
      state.target = pick([state.target]);
      state.zapIndex = -1;
      state.zap = null;
      state.locked = [];
      state.found = [];
      state.times = null;
      state.winner = null;
      times = {};
      zaps.length = 0;
      targetZap = 3 + Math.floor(ctx.random() * 7);
      state.phaseEndsAt = ctx.now() + ZAP_READY_MS;
      publish();
      const g = gen;
      ctx.schedule(ZAP_READY_MS, () => g === gen && (state.phase = "zap", next()));
    };

    /** Chaîne suivante : de plus en plus vite au fil des manches. */
    const next = () => {
      const g = gen;
      const i = zaps.length;
      const channel = i === targetZap ? state.target : pick([state.target, zaps.at(-1)?.channel ?? -1]);
      const zap = { channel, at: ctx.now() };
      zaps.push(zap);
      state.zapIndex = i;
      state.zap = zap;
      publish();
      if (i === targetZap) {
        ctx.schedule(ZAP_TARGET_MS, () => g === gen && result());
        return;
      }
      const pace = Math.max(380, 820 - state.round * 70);
      ctx.schedule(pace * (0.75 + ctx.random() * 0.5), () => g === gen && next());
    };

    const result = () => {
      if (state.phase !== "zap") return;
      gen++;
      const ranked = Object.entries(times).sort((a, b) => a[1] - b[1]);
      state.winner = ranked[0]?.[0] ?? null;
      if (state.winner) state.scores[state.winner]!++;
      for (const id of ids) totalTime[id]! += times[id] ?? ZAP_TARGET_MS + 400;
      for (const [id, t] of ranked) best[id] = Math.min(best[id] ?? Infinity, t);
      state.times = { ...times };
      state.phase = "result";
      state.phaseEndsAt = ctx.now() + ZAP_RESULT_MS;
      publish();
      ctx.schedule(ZAP_RESULT_MS, () => (state.round >= ZAP_ROUNDS ? end() : ready()));
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]! || totalTime[a]! - totalTime[b]!),
        Object.fromEntries(Object.entries(best).map(([id, t]) => [id, { reflexe: Math.round(t) }])),
      );
    };

    return {
      start: ready,
      input(playerId, raw) {
        const input = raw as Partial<ZappeurInput> | null;
        if (state.phase !== "zap" || !ids.includes(playerId) || !input || input.round !== state.round) return;
        if (state.locked.includes(playerId) || playerId in times) return;
        if (!Number.isInteger(input.zap) || typeof input.dt !== "number" || !Number.isFinite(input.dt)) return;
        const zap = zaps[input.zap!];
        if (!zap) return;
        if (input.zap !== targetZap) {
          state.locked.push(playerId);
          publish();
          return;
        }
        // Temps mesuré sur l'appareil, mais jamais plus court que ce que le serveur rend possible.
        const elapsed = ctx.now() - zap.at;
        const dt = Math.max(80, Math.min(input.dt, elapsed + 150));
        times[playerId] = dt;
        state.found.push(playerId);
        publish();
        if (ids.every((id) => id in times || state.locked.includes(id))) ctx.schedule(250, result);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let acted = "";
    return {
      onState(state) {
        if (state.phase !== "zap" || !state.zap) return;
        const key = `${state.round}:${state.zapIndex}`;
        if (acted === key) return;
        acted = key;
        const round = state.round;
        const zap = state.zapIndex;
        if (state.zap.channel !== state.target) {
          // Un bot distrait appuie parfois trop vite sur une chaîne de la même couleur.
          if (ctx.random() < (1 - skill.accuracy) * 0.5 + skill.chaos * 0.05) ctx.schedule(200, () => ctx.send({ round, zap, dt: 200 }));
          return;
        }
        if (ctx.random() > skill.accuracy) return;
        const dt = Math.max(170, gaussian(ctx.random, 430 / skill.speed, 70 + skill.chaos * 220));
        if (dt < 1050) ctx.schedule(dt, () => ctx.send({ round, zap, dt: Math.round(dt) }));
      },
    };
  },
});
