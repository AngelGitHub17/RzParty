import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { TRI_DURATION_MS, TRI_PENALTY_MS, TRI_SETS, makeSet, type TriInput, type TriPrivate, type TriState } from "./types.ts";

export default defineMiniGame<TriState, TriPrivate, TriInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    // Les mêmes séries pour tout le monde.
    const sets = Array.from({ length: TRI_SETS }, (_, i) => makeSet(ctx.random, i));
    const state: TriState = {
      endsAt: 0,
      progress: Object.fromEntries(ids.map((id) => [id, { sets: 0, step: 0 }])),
      finishers: [],
      finished: false,
    };
    const done: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
    const lockedUntil: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const progressAt: Record<string, number> = Object.fromEntries(ids.map((id) => [id, Infinity]));
    const send = (id: string, last: TriPrivate["last"]) => {
      const p = state.progress[id]!;
      if (p.sets >= TRI_SETS) return;
      ctx.sendTo(id, { set: p.sets, numbers: sets[p.sets]!, done: [...done[id]!], lockedUntil: lockedUntil[id]!, last });
    };
    const end = () => {
      if (state.finished) return;
      state.finished = true;
      ctx.publish(structuredClone(state));
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => {
          const fa = state.finishers.indexOf(a), fb = state.finishers.indexOf(b);
          if (fa >= 0 || fb >= 0) return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb);
          const pa = state.progress[a]!, pb = state.progress[b]!;
          const diff = pb.sets * 100 + pb.step - (pa.sets * 100 + pa.step);
          if (diff) return diff;
          if (!pa.sets && !pa.step) return 0;
          return progressAt[a]! - progressAt[b]!;
        }),
        Object.fromEntries(ids.map((id) => [id, { series: state.progress[id]!.sets }])),
      );
    };

    return {
      start() {
        state.endsAt = ctx.now() + TRI_DURATION_MS;
        ctx.publish(structuredClone(state));
        for (const id of ids) send(id, null);
        ctx.schedule(TRI_DURATION_MS, end);
      },

      input(playerId, raw) {
        const input = raw as Partial<TriInput> | null;
        if (state.finished || !ids.includes(playerId) || !input) return;
        const p = state.progress[playerId]!;
        const now = ctx.now();
        if (input.set !== p.sets || p.sets >= TRI_SETS || now < lockedUntil[playerId]!) return;
        const numbers = sets[p.sets]!;
        const expected = [...numbers].sort((a, b) => a - b)[p.step];
        if (input.value === expected) {
          p.step++;
          done[playerId]!.push(expected!);
          progressAt[playerId] = now;
          if (p.step >= numbers.length) {
            p.sets++;
            p.step = 0;
            done[playerId] = [];
            if (p.sets >= TRI_SETS) {
              state.finishers.push(playerId);
              if (state.finishers.length === ids.length) ctx.schedule(600, end);
            }
          }
          send(playerId, null);
        } else if (numbers.includes(input.value as number)) {
          // Mauvais ordre : la série recommence, avec un petit blocage.
          p.step = 0;
          done[playerId] = [];
          lockedUntil[playerId] = now + TRI_PENALTY_MS;
          send(playerId, "faux");
        } else return;
        ctx.publish(structuredClone(state));
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let current: TriPrivate | null = null;
    let pending = false;
    const tap = () => {
      pending = false;
      const c = current;
      if (!c) return;
      const sorted = [...c.numbers].sort((a, b) => a - b);
      const want = sorted[c.done.length];
      if (want === undefined) return;
      const wrong = ctx.random() > skill.accuracy * 0.99;
      const value = wrong ? c.numbers[Math.floor(ctx.random() * c.numbers.length)]! : want;
      ctx.send({ set: c.set, value });
    };
    return {
      onState() {},
      onPrivate(data) {
        current = data;
        if (pending) return;
        pending = true;
        const first = data.done.length === 0 ? 500 : 0;
        const wait = Math.max(0, data.lockedUntil - ctx.now());
        ctx.schedule(wait + first + Math.max(230, gaussian(ctx.random, 520 / skill.speed, 80 + skill.chaos * 300)), tap);
      },
    };
  },
});
