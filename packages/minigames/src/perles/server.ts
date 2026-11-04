import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { CLOSING_MS, LATENCY_MS, OYSTERS, PERLES_MS, PINCH_MS, type Opening, type PerlesInput, type PerlesState, type Treasure } from "./types.ts";

export default defineMiniGame<PerlesState, null, PerlesInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: PerlesState = {
      endsAt: 0,
      openings: [],
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      taken: Object.fromEntries(ids.map((id) => [id, []])),
      pinched: {},
      finished: false,
    };
    const all = new Map<number, Opening>();
    const pearls: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let next = 0;
    let startedAt = 0;
    const publish = () => ctx.publish(structuredClone(state));

    const open = () => {
      if (state.finished) return;
      const now = ctx.now();
      const busy = new Set(state.openings.filter((o) => o.until > now).map((o) => o.oyster));
      const free = Array.from({ length: OYSTERS }, (_, i) => i).filter((i) => !busy.has(i));
      if (free.length) {
        const r = ctx.random();
        const treasure: Treasure = r < 0.1 ? "doree" : r < 0.3 ? "crabe" : "perle";
        const elapsed = now - startedAt;
        const length = Math.max(700, 1500 - elapsed / 30) * (0.8 + ctx.random() * 0.4);
        const o = { id: next++, oyster: free[Math.floor(ctx.random() * free.length)]!, treasure, from: now, until: now + length };
        all.set(o.id, o);
        state.openings = [...state.openings.filter((x) => x.until > now), o];
        publish();
        ctx.schedule(length + 20, () => {
          state.openings = state.openings.filter((x) => x.id !== o.id);
          publish();
        });
      }
      ctx.schedule(Math.max(300, 700 - (now - startedAt) / 60) * (0.7 + ctx.random() * 0.6), open);
    };

    return {
      start() {
        startedAt = ctx.now();
        state.endsAt = startedAt + PERLES_MS;
        publish();
        ctx.schedule(500, open);
        ctx.schedule(PERLES_MS, () => {
          state.finished = true;
          state.openings = [];
          publish();
          ctx.finish(
            rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]! || pearls[b]! - pearls[a]!),
            Object.fromEntries(ids.map((id) => [id, { perles: pearls[id]! }])),
          );
        });
      },
      input(playerId, raw) {
        const input = raw as Partial<PerlesInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || !Number.isInteger(input.opening) || typeof input.dt !== "number") return;
        const now = ctx.now();
        if ((state.pinched[playerId] ?? 0) > now) return;
        const o = all.get(input.opening!);
        if (!o || state.taken[playerId]!.includes(o.id) || now < o.from || now > o.until + LATENCY_MS) return;
        // L'instant de l'appui (mesuré sur l'appareil), borné par ce que le serveur rend possible.
        const at = Math.max(0, Math.min(input.dt!, now - o.from + 150));
        const length = o.until - o.from;
        if (at > length) return;
        state.taken[playerId]!.push(o.id);
        if (at > length - CLOSING_MS) {
          state.pinched[playerId] = now + PINCH_MS;
        } else if (o.treasure === "crabe") {
          state.scores[playerId] = Math.max(0, state.scores[playerId]! - 1);
        } else {
          state.scores[playerId]! += o.treasure === "doree" ? 3 : 1;
          pearls[playerId]!++;
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
        for (const o of state.openings) {
          if (seen.has(o.id)) continue;
          seen.add(o.id);
          // Un bot évite (souvent) les crabes et rate parfois des perles.
          if (o.treasure === "crabe" ? ctx.random() < skill.accuracy * 0.9 + 0.05 : ctx.random() > skill.accuracy * 0.88) continue;
          const length = o.until - o.from;
          const dt = Math.max(160, gaussian(ctx.random, 480 / skill.speed, 90 + skill.chaos * 260));
          if (dt < length) ctx.schedule(dt, () => ctx.send({ opening: o.id, dt: Math.round(dt) }));
        }
      },
    };
  },
});
