import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { DIRS, LABY_DURATION_MS, LABY_SIZE, MIN_STEP_MS, OPEN, distances, makeMaze, type Dir, type LabyInput, type LabyState } from "./types.ts";

export default defineMiniGame<LabyState, null, LabyInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const size = LABY_SIZE;
    const cells = makeMaze(ctx.random, size);
    const exit = { x: size - 1, y: size - 1 };
    const dist = distances(cells, size, exit);
    const state: LabyState = {
      size,
      cells,
      exit,
      positions: Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }])),
      arrived: [],
      endsAt: 0,
      finished: false,
    };
    let startedAt = 0;
    const arrivedAt: Record<string, number> = {};
    const lastStep: Record<string, number> = {};
    let publishQueued = false;

    // Les déplacements arrivent vite : on regroupe les envois (au plus un tous les 50 ms).
    const publish = () => {
      if (publishQueued) return;
      publishQueued = true;
      ctx.schedule(50, () => {
        publishQueued = false;
        ctx.publish(structuredClone(state));
      });
    };

    const end = () => {
      if (state.finished) return;
      state.finished = true;
      ctx.publish(structuredClone(state));
      const left = (id: string) => dist[state.positions[id]!.y * size + state.positions[id]!.x]!;
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => {
          const ia = state.arrived.indexOf(a), ib = state.arrived.indexOf(b);
          if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
          return left(a) - left(b);
        }),
        Object.fromEntries(state.arrived.map((id) => [id, { temps: Math.round((arrivedAt[id]! - startedAt) / 100) / 10 }])),
      );
    };

    return {
      start() {
        startedAt = ctx.now();
        state.endsAt = startedAt + LABY_DURATION_MS;
        ctx.publish(structuredClone(state));
        ctx.schedule(LABY_DURATION_MS, end);
      },

      input(playerId, raw) {
        const input = raw as Partial<LabyInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || typeof input.dir !== "string" || !(input.dir in DIRS)) return;
        if (state.arrived.includes(playerId)) return;
        const now = ctx.now();
        if (now - (lastStep[playerId] ?? 0) < MIN_STEP_MS) return;
        const pos = state.positions[playerId]!;
        const dir = input.dir as Dir;
        if (!(cells[pos.y * size + pos.x]! & OPEN[dir])) return;
        lastStep[playerId] = now;
        pos.x += DIRS[dir][0];
        pos.y += DIRS[dir][1];
        if (pos.x === exit.x && pos.y === exit.y) {
          state.arrived.push(playerId);
          arrivedAt[playerId] = now;
          if (state.arrived.length === ids.length) ctx.schedule(800, end);
        }
        publish();
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let started = false;
    let dist: number[] = [];
    let pos = { x: 0, y: 0 };
    let size = 0;
    let cells: number[] = [];
    const step = () => {
      if (pos.x === size - 1 && pos.y === size - 1) return;
      const here = pos.y * size + pos.x;
      const open = (Object.keys(DIRS) as Dir[]).filter((d) => cells[here]! & OPEN[d]);
      const best = open.filter((d) => dist[(pos.y + DIRS[d][1]) * size + pos.x + DIRS[d][0]]! < dist[here]!);
      // Parfois le bot se trompe de couloir.
      const dir = ctx.random() < skill.accuracy * 0.97 && best.length ? best[0]! : open[Math.floor(ctx.random() * open.length)]!;
      pos = { x: pos.x + DIRS[dir][0], y: pos.y + DIRS[dir][1] };
      ctx.send({ dir });
      ctx.schedule(Math.max(MIN_STEP_MS + 10, gaussian(ctx.random, 330 / skill.speed, 60 + skill.chaos * 200)), step);
    };
    return {
      onState(state) {
        if (started || state.finished) return;
        started = true;
        size = state.size;
        cells = state.cells;
        dist = distances(cells, size, state.exit);
        ctx.schedule(600 + ctx.random() * 400, step);
      },
    };
  },
});
