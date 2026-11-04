import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { BALLOONS_MS, BALLOON_COLORS, COLOR_EVERY_MS, LATENCY_MS, RISE_MS, type Balloon, type BallonsInput, type BallonsState } from "./types.ts";

export default defineMiniGame<BallonsState, null, BallonsInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: BallonsState = {
      endsAt: 0,
      target: 0,
      targetSince: 0,
      balloons: [],
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      popped: Object.fromEntries(ids.map((id) => [id, []])),
      finished: false,
    };
    const all = new Map<number, Balloon>();
    let previous = { color: -2, until: 0 };
    let next = 0;
    let startedAt = 0;
    let good: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const publish = () => ctx.publish(structuredClone(state));

    const recolor = () => {
      if (state.finished) return;
      const now = ctx.now();
      previous = { color: state.target, until: now + LATENCY_MS };
      const choices = BALLOON_COLORS.map((_, i) => i).filter((i) => i !== state.target);
      state.target = choices[Math.floor(ctx.random() * choices.length)]!;
      state.targetSince = now;
      publish();
      ctx.schedule(COLOR_EVERY_MS * (0.7 + ctx.random() * 0.6), recolor);
    };

    const spawn = () => {
      if (state.finished) return;
      const now = ctx.now();
      const elapsed = now - startedAt;
      // Au moins un ballon sur trois est de la bonne couleur.
      const r = ctx.random();
      const color = r < 0.05 ? -1 : r < 0.38 ? state.target : Math.floor(ctx.random() * BALLOON_COLORS.length);
      const balloon = { id: next++, x: 0.06 + ctx.random() * 0.88, color, born: now };
      all.set(balloon.id, balloon);
      state.balloons = [...state.balloons.filter((b) => b.born + RISE_MS > now), balloon];
      publish();
      ctx.schedule(Math.max(260, 640 - elapsed / 60) * (0.7 + ctx.random() * 0.6), spawn);
    };

    return {
      start() {
        startedAt = ctx.now();
        state.endsAt = startedAt + BALLOONS_MS;
        state.target = Math.floor(ctx.random() * BALLOON_COLORS.length);
        state.targetSince = startedAt;
        publish();
        ctx.schedule(500, spawn);
        ctx.schedule(COLOR_EVERY_MS, recolor);
        ctx.schedule(BALLOONS_MS, () => {
          state.finished = true;
          state.balloons = [];
          publish();
          ctx.finish(
            rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]! || good[b]! - good[a]!),
            Object.fromEntries(ids.map((id) => [id, { ballons: good[id]! }])),
          );
        });
      },

      input(playerId, raw) {
        const input = raw as Partial<BallonsInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || !Number.isInteger(input.balloon)) return;
        const b = all.get(input.balloon!);
        const now = ctx.now();
        if (!b || now < b.born || now > b.born + RISE_MS + LATENCY_MS || state.popped[playerId]!.includes(b.id)) return;
        state.popped[playerId]!.push(b.id);
        const right = b.color === -1 || b.color === state.target || (b.color === previous.color && now <= previous.until);
        if (right) {
          state.scores[playerId]! += b.color === -1 ? 3 : 1;
          good[playerId]!++;
        } else state.scores[playerId] = Math.max(0, state.scores[playerId]! - 1);
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
        for (const b of state.balloons) {
          if (seen.has(b.id)) continue;
          seen.add(b.id);
          const wanted = b.color === -1 || b.color === state.target;
          // Bonne couleur : souvent éclatée ; mauvaise : parfois, par erreur.
          if (wanted ? ctx.random() > skill.accuracy * 0.85 : ctx.random() > (1 - skill.accuracy) * 0.6 + skill.chaos * 0.08) continue;
          const delay = Math.max(250, gaussian(ctx.random, 900 / skill.speed, 200 + skill.chaos * 500));
          ctx.schedule(Math.min(delay, 3800), () => ctx.send({ balloon: b.id }));
        }
      },
    };
  },
});
