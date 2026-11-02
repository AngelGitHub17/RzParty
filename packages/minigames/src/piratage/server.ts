import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import {
  MAX_TRIES,
  PIRATAGE_DURATION_MS,
  allCodes,
  isValidGuess,
  marksFor,
  score,
  type Feedback,
  type PiratageInput,
  type PiratagePrivate,
  type PiratageState,
} from "./types.ts";

const better = (a: Feedback, b: Feedback) => a.exact * 2 + a.near > b.exact * 2 + b.near;

export default defineMiniGame<PiratageState, PiratagePrivate, PiratageInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    // Même code pour tout le monde : la course est équitable.
    const codes = allCodes();
    const code = codes[Math.floor(ctx.random() * codes.length)]!;
    const state: PiratageState = {
      endsAt: 0,
      progress: Object.fromEntries(ids.map((id) => [id, { tries: 0, best: { exact: 0, near: 0 }, cracked: false, history: [] }])),
      finished: false,
      code: null,
    };
    const guesses: Record<string, PiratagePrivate["guesses"]> = Object.fromEntries(ids.map((id) => [id, []]));
    const crackedAt: Record<string, number> = {};
    const bestAt: Record<string, number> = Object.fromEntries(ids.map((id) => [id, Infinity]));

    const end = () => {
      if (state.finished) return;
      state.finished = true;
      state.code = code;
      ctx.publish(structuredClone(state));
      const p = state.progress;
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => {
          const ca = p[a]!.cracked, cb = p[b]!.cracked;
          if (ca !== cb) return ca ? -1 : 1;
          if (ca) return crackedAt[a]! - crackedAt[b]!;
          const sa = p[a]!.best.exact * 2 + p[a]!.best.near;
          const sb = p[b]!.best.exact * 2 + p[b]!.best.near;
          if (sa !== sb) return sb - sa;
          if (sa === 0) return 0;
          return bestAt[a]! - bestAt[b]!;
        }),
        Object.fromEntries(ids.filter((id) => p[id]!.cracked).map((id) => [id, { essais: p[id]!.tries }])),
      );
    };
    const checkEnd = () => {
      // Fin anticipée : tout le monde a trouvé ou épuisé ses essais.
      if (ids.every((id) => state.progress[id]!.cracked || state.progress[id]!.tries >= MAX_TRIES)) ctx.schedule(1500, end);
    };

    return {
      start() {
        state.endsAt = ctx.now() + PIRATAGE_DURATION_MS;
        ctx.publish(structuredClone(state));
        for (const id of ids) ctx.sendTo(id, { guesses: [] });
        ctx.schedule(PIRATAGE_DURATION_MS, end);
      },

      input(playerId, raw) {
        const input = raw as Partial<PiratageInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || !isValidGuess(input.guess)) return;
        const p = state.progress[playerId]!;
        if (p.cracked || p.tries >= MAX_TRIES) return;
        const feedback = score(code, input.guess);
        p.tries++;
        p.history.push(feedback);
        if (better(feedback, p.best)) {
          p.best = feedback;
          bestAt[playerId] = ctx.now();
        }
        if (feedback.exact === 4) {
          p.cracked = true;
          crackedAt[playerId] = ctx.now();
        }
        guesses[playerId]!.push({ guess: input.guess, feedback, marks: marksFor(code, input.guess) });
        ctx.sendTo(playerId, { guesses: [...guesses[playerId]!] });
        ctx.publish(structuredClone(state));
        checkEnd();
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let candidates = allCodes();
    let waiting = false;
    let seen = 0;
    const play = () => {
      waiting = true;
      // Un bot précis joue un code compatible avec tous les indices ; sinon il tente un peu au hasard.
      const pool = ctx.random() < skill.accuracy ? candidates : allCodes();
      const guess = pool[Math.floor(ctx.random() * pool.length)] ?? allCodes()[0]!;
      const think = Math.max(1500, gaussian(ctx.random, 5200 / skill.speed, 900 + skill.chaos * 2500));
      ctx.schedule(think, () => ctx.send({ guess }));
    };
    return {
      onState(state) {
        const me = state.progress[ctx.player.id];
        if (!me || state.finished || me.cracked || me.tries >= MAX_TRIES) return;
        if (!waiting && me.tries === 0 && seen === 0) {
          seen = -1;
          play();
        }
      },
      onPrivate(data) {
        if (data.guesses.length === 0 || data.guesses.length === seen) return;
        seen = data.guesses.length;
        const last = data.guesses.at(-1)!;
        if (last.feedback.exact === 4) return;
        const wanted = last.marks.join();
        candidates = candidates.filter((c) => marksFor(c, last.guess).join() === wanted);
        waiting = false;
        if (data.guesses.length < MAX_TRIES) play();
      },
    };
  },
});
