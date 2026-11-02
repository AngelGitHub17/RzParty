import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { BANDITS_DURATION_MS, BANDIT_LATENCY_MS, WINDOWS, type BanditsInput, type BanditsState, type Popup } from "./types.ts";

export default defineMiniGame<BanditsState, null, BanditsInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: BanditsState = {
      endsAt: 0,
      popups: [],
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      hits: Object.fromEntries(ids.map((id) => [id, []])),
      finished: false,
    };
    const all = new Map<number, Popup & { from: number }>();
    const bandits: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let next = 0;
    let startedAt = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const spawn = () => {
      if (state.finished) return;
      const now = ctx.now();
      const elapsed = now - startedAt;
      const visible = Math.max(700, 1500 - elapsed / 30);
      const busy = new Set(state.popups.map((p) => p.window));
      const free = Array.from({ length: WINDOWS }, (_, i) => i).filter((i) => !busy.has(i));
      if (free.length) {
        const popup: Popup = { id: next++, window: free[Math.floor(ctx.random() * free.length)]!, kind: ctx.random() < 0.7 ? "bandit" : "habitant", until: now + visible };
        all.set(popup.id, { ...popup, from: now });
        state.popups.push(popup);
        ctx.schedule(visible, () => {
          state.popups = state.popups.filter((p) => p.id !== popup.id);
          publish();
        });
        publish();
      }
      ctx.schedule(Math.max(350, 750 - elapsed / 60) * (0.7 + ctx.random() * 0.6), spawn);
    };

    return {
      start() {
        startedAt = ctx.now();
        state.endsAt = startedAt + BANDITS_DURATION_MS;
        publish();
        ctx.schedule(700, spawn);
        ctx.schedule(BANDITS_DURATION_MS, () => {
          state.finished = true;
          state.popups = [];
          publish();
          ctx.finish(
            rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]!),
            Object.fromEntries(ids.map((id) => [id, { bandits: bandits[id]! }])),
          );
        });
      },
      input(playerId, raw) {
        const input = raw as Partial<BanditsInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || typeof input.popup !== "number") return;
        const p = all.get(input.popup);
        const now = ctx.now();
        if (!p || now < p.from || now > p.until + BANDIT_LATENCY_MS || state.hits[playerId]!.includes(p.id)) return;
        state.hits[playerId]!.push(p.id);
        if (p.kind === "bandit") {
          state.scores[playerId]! += 1;
          bandits[playerId]!++;
        } else state.scores[playerId] = state.scores[playerId]! - 3;
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
        for (const p of state.popups) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          // Un bot distrait tire parfois sur un habitant, ou rate un bandit.
          const wantsToShoot = p.kind === "bandit" ? ctx.random() < skill.accuracy * 0.9 : ctx.random() > skill.accuracy * 0.97;
          if (!wantsToShoot) continue;
          ctx.schedule(Math.max(230, gaussian(ctx.random, 600 / skill.speed, 100 + skill.chaos * 300)), () => ctx.send({ popup: p.id }));
        }
      },
    };
  },
});
