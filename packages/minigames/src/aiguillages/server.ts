import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, tipCheater } from "../contract.ts";
import { definition } from "./definition.ts";
import { EXITS, STATIONS, SWITCHES, TRAIN_CHOOSE_MS, TRAIN_READY_MS, TRAIN_RESULT_MS, TRAIN_ROUNDS, exitOf, type AiguillagesInput, type AiguillagesState, type Path } from "./types.ts";

export default defineMiniGame<AiguillagesState, null, AiguillagesInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: AiguillagesState = {
      round: 0,
      rounds: TRAIN_ROUNDS,
      phase: "ready",
      startedAt: 0,
      phaseEndsAt: 0,
      wiring: [],
      target: 0,
      answered: [],
      results: null,
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    let answers: Record<string, { path: Path; t: number }> = {};
    const totalTime: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const good: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let gen = 0;
    const publish = () => ctx.publish(structuredClone(state));

    /** Mélange les gares : des rails qui se croisent, jamais tout droit. */
    const shuffle = () => {
      const w = STATIONS.map((_, i) => i).slice(0, EXITS);
      do {
        for (let i = w.length - 1; i > 0; i--) {
          const j = Math.floor(ctx.random() * (i + 1));
          [w[i], w[j]] = [w[j]!, w[i]!];
        }
      } while (w.filter((s, i) => s === i).length > 2);
      return w;
    };

    const ready = () => {
      gen++;
      state.round++;
      state.phase = "ready";
      state.wiring = shuffle();
      state.target = Math.floor(ctx.random() * EXITS);
      state.answered = [];
      state.results = null;
      answers = {};
      state.phaseEndsAt = ctx.now() + TRAIN_READY_MS;
      publish();
      const g = gen;
      ctx.schedule(TRAIN_READY_MS, () => {
        if (g !== gen) return;
        state.phase = "choose";
        // L'intrus connaît le bon réglage (0 = en haut, 1 = en bas).
        const exit = state.wiring.indexOf(state.target);
        if (exit >= 0) tipCheater(ctx, `Aiguillages : ${Array.from({ length: SWITCHES }, (_, i) => ((exit >> (SWITCHES - 1 - i)) & 1 ? "bas" : "haut")).join(", ")}`);
        state.startedAt = ctx.now();
        state.phaseEndsAt = state.startedAt + TRAIN_CHOOSE_MS;
        publish();
        ctx.schedule(TRAIN_CHOOSE_MS, () => g === gen && reveal());
      });
    };

    const reveal = () => {
      if (state.phase !== "choose") return;
      gen++;
      const ok = (id: string) => answers[id] !== undefined && state.wiring[exitOf(answers[id]!.path)] === state.target;
      const winners = ids.filter(ok).sort((a, b) => answers[a]!.t - answers[b]!.t);
      const fastest = winners[0];
      state.results = {};
      for (const id of ids) {
        const a = answers[id];
        const right = ok(id);
        if (right) {
          state.scores[id]! += id === fastest ? 2 : 1;
          good[id]!++;
        }
        totalTime[id]! += a?.t ?? TRAIN_CHOOSE_MS;
        state.results[id] = { path: a?.path ?? null, ok: right, time: a?.t ?? null, fastest: id === fastest };
      }
      state.phase = "result";
      state.phaseEndsAt = ctx.now() + TRAIN_RESULT_MS;
      publish();
      ctx.schedule(TRAIN_RESULT_MS, () => (state.round >= TRAIN_ROUNDS ? end() : ready()));
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]! || totalTime[a]! - totalTime[b]!),
        Object.fromEntries(ids.map((id) => [id, { trains: good[id]! }])),
      );
    };

    return {
      start: ready,
      input(playerId, raw) {
        const input = raw as Partial<AiguillagesInput> | null;
        if (state.phase !== "choose" || !ids.includes(playerId) || !input || input.round !== state.round || playerId in answers) return;
        const path = input.path;
        if (!Array.isArray(path) || path.length !== SWITCHES || path.some((b) => b !== 0 && b !== 1)) return;
        if (typeof input.t !== "number" || !Number.isFinite(input.t)) return;
        const elapsed = ctx.now() - state.startedAt;
        const t = Math.max(300, Math.min(input.t, elapsed + 150));
        answers[playerId] = { path: [...path] as Path, t };
        state.answered.push(playerId);
        publish();
        if (ids.every((id) => id in answers)) ctx.schedule(400, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let played = 0;
    return {
      onState(state) {
        if (state.phase !== "choose" || played === state.round) return;
        played = state.round;
        const round = state.round;
        const exit = state.wiring.indexOf(state.target);
        let target = exit;
        // Erreur de lecture : le bot suit le mauvais rail (souvent le voisin).
        if (ctx.random() > skill.accuracy * 0.92) target = Math.max(0, Math.min(EXITS - 1, exit + (ctx.random() < 0.5 ? -1 : 1)));
        const path = Array.from({ length: SWITCHES }, (_, i) => ((target >> (SWITCHES - 1 - i)) & 1) as 0 | 1);
        const t = Math.max(900, gaussian(ctx.random, 4200 / skill.speed, 900 + skill.chaos * 2500));
        if (t < TRAIN_CHOOSE_MS - 200) ctx.schedule(t, () => ctx.send({ round, path, t: Math.round(t) }));
      },
    };
  },
});
