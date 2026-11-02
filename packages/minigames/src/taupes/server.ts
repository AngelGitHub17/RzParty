import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { HOLES, LATENCY_MS, TAUPES_DURATION_MS, type Mole, type TaupesInput, type TaupesState } from "./types.ts";

export default defineMiniGame<TaupesState, null, TaupesInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: TaupesState = {
      endsAt: 0,
      moles: [],
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      hits: Object.fromEntries(ids.map((id) => [id, []])),
      finished: false,
    };
    /** Toutes les taupes sorties (pour valider un coup arrivé juste après la disparition). */
    const all = new Map<number, Mole & { from: number }>();
    let next = 0;
    let startedAt = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const spawn = () => {
      if (state.finished) return;
      const now = ctx.now();
      const elapsed = now - startedAt;
      // Ça s'accélère : les taupes restent moins longtemps et sortent plus souvent.
      const visible = Math.max(650, 1300 - elapsed / 40);
      const busy = new Set(state.moles.map((m) => m.hole));
      const free = Array.from({ length: HOLES }, (_, i) => i).filter((i) => !busy.has(i));
      if (free.length) {
        const mole = { id: next++, hole: free[Math.floor(ctx.random() * free.length)]!, golden: ctx.random() < 0.12, until: now + visible };
        all.set(mole.id, { ...mole, from: now });
        state.moles.push(mole);
        ctx.schedule(visible, () => {
          state.moles = state.moles.filter((m) => m.id !== mole.id);
          publish();
        });
        publish();
      }
      ctx.schedule(Math.max(380, 800 - elapsed / 50) * (0.7 + ctx.random() * 0.6), spawn);
    };

    return {
      start() {
        startedAt = ctx.now();
        state.endsAt = startedAt + TAUPES_DURATION_MS;
        publish();
        ctx.schedule(600, spawn);
        ctx.schedule(TAUPES_DURATION_MS, () => {
          state.finished = true;
          state.moles = [];
          publish();
          ctx.finish(
            rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]!),
            Object.fromEntries(ids.map((id) => [id, { taupes: state.hits[id]!.length }])),
          );
        });
      },

      input(playerId, raw) {
        const input = raw as Partial<TaupesInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || !Number.isInteger(input.hole)) return;
        const now = ctx.now();
        const mole = typeof input.mole === "number" ? all.get(input.mole) : undefined;
        const valid = mole && mole.hole === input.hole && now >= mole.from && now <= mole.until + LATENCY_MS && !state.hits[playerId]!.includes(mole.id);
        if (valid) {
          state.hits[playerId]!.push(mole.id);
          state.scores[playerId]! += mole.golden ? 3 : 1;
        } else if (!mole) {
          // Trou vide : un point de pénalité (sans descendre sous zéro).
          state.scores[playerId] = Math.max(0, state.scores[playerId]! - 1);
        }
        publish();
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    const seen = new Set<number>();
    return {
      onState(state) {
        if (state.finished) return;
        for (const mole of state.moles) {
          if (seen.has(mole.id)) continue;
          seen.add(mole.id);
          if (ctx.random() > skill.accuracy * 0.92) continue;
          const delay = Math.max(220, gaussian(ctx.random, 560 / skill.speed, 90 + skill.chaos * 300));
          ctx.schedule(delay, () => ctx.send({ hole: mole.hole, mole: mole.id }));
        }
      },
    };
  },
});
