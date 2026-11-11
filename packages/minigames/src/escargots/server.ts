import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { SNAIL_GOAL, SNAIL_MAX_MS, SNAIL_MAX_RATE, SNAIL_READY_MS, SNAIL_RESULT_MS, SNAIL_TIRED_MS, type EscargotsInput, type EscargotsState } from "./types.ts";

export default defineMiniGame<EscargotsState, null, EscargotsInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: EscargotsState = {
      phase: "ready",
      startedAt: 0,
      phaseEndsAt: 0,
      progress: Object.fromEntries(ids.map((id) => [id, 0])),
      tiredUntil: Object.fromEntries(ids.map((id) => [id, 0])),
      finished: {},
    };
    /** Instants des derniers appuis acceptés, par joueur (pour mesurer le rythme). */
    const recent: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
    let dirty = false;
    const publish = () => {
      dirty = false;
      ctx.publish(structuredClone(state));
    };

    const end = () => {
      if (state.phase !== "run") return;
      state.phase = "result";
      state.phaseEndsAt = ctx.now() + SNAIL_RESULT_MS;
      publish();
      ctx.schedule(SNAIL_RESULT_MS, () => {
        state.phase = "done";
        publish();
        // Les arrivés par temps, puis les autres selon la distance parcourue.
        const key = (id: string) => (id in state.finished ? state.finished[id]! : SNAIL_MAX_MS + 1000 - state.progress[id]!);
        ctx.finish(
          rankBy(ids, (id) => id, (a, b) => key(a) - key(b)),
          Object.fromEntries(Object.entries(state.finished).map(([id, t]) => [id, { temps: Math.round(t / 10) / 100 }])),
        );
      });
    };

    return {
      start() {
        state.phaseEndsAt = ctx.now() + SNAIL_READY_MS;
        publish();
        ctx.schedule(SNAIL_READY_MS, () => {
          state.phase = "run";
          state.startedAt = ctx.now();
          state.phaseEndsAt = state.startedAt + SNAIL_MAX_MS;
          publish();
          const tick = () => {
            if (state.phase !== "run") return;
            if (dirty) publish();
            ctx.schedule(150, tick);
          };
          ctx.schedule(150, tick);
          ctx.schedule(SNAIL_MAX_MS, end);
        });
      },
      input(playerId, raw) {
        const input = raw as Partial<EscargotsInput> | null;
        if (state.phase !== "run" || !ids.includes(playerId) || playerId in state.finished) return;
        const taps = input?.taps;
        if (typeof taps !== "number" || !Number.isInteger(taps) || taps < 1 || taps > 6) return;
        const now = ctx.now();
        if (now < state.tiredUntil[playerId]!) return;
        const list = recent[playerId]!;
        for (let k = 0; k < taps; k++) list.push(now);
        while (list.length && list[0]! < now - 1000) list.shift();
        // Trop vite : essoufflé (les appuis de ce paquet ne comptent pas).
        if (list.length > SNAIL_MAX_RATE) {
          state.tiredUntil[playerId] = now + SNAIL_TIRED_MS;
          list.length = 0;
          dirty = true;
          return;
        }
        state.progress[playerId] = Math.min(SNAIL_GOAL, state.progress[playerId]! + taps);
        if (state.progress[playerId] === SNAIL_GOAL) state.finished[playerId] = now - state.startedAt;
        dirty = true;
        if (ids.every((id) => id in state.finished)) end();
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let running = false;
    return {
      onState(state) {
        if (state.phase !== "run" || running) return;
        running = true;
        // Un bon bot tapote juste sous la limite ; un bot brouillon la dépasse parfois.
        const rate = Math.min(9.5, 5 + skill.speed * 1.6 + skill.chaos * 1.5);
        const step = () => {
          ctx.send({ taps: 1 });
          const wait = Math.max(70, gaussian(ctx.random, 1000 / rate, 25 + skill.chaos * 60));
          ctx.schedule(wait, step);
        };
        ctx.schedule(200 + ctx.random() * 300, step);
      },
    };
  },
});
