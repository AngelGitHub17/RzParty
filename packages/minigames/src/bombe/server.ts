import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame } from "../contract.ts";
import { definition } from "./definition.ts";
import { BLAST_PAUSE_MS, FUSE_MAX_MS, FUSE_MIN_MS, WORDS, lettersFor, type BombeInput, type BombeState } from "./types.ts";

export default defineMiniGame<BombeState, null, BombeInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: BombeState = {
      holder: null,
      word: "",
      letters: [],
      progress: 0,
      pass: 0,
      target: null,
      alive: [...ids],
      out: [],
      blast: null,
      heat: 0,
      finished: false,
    };
    let bomb = 0;
    let explodesAt = 0;
    let fuse = 0;
    const pick = <T>(list: T[]) => list[Math.floor(ctx.random() * list.length)]!;
    const publish = () => ctx.publish(structuredClone(state));

    const give = (playerId: string) => {
      state.holder = playerId;
      state.pass++;
      let word = pick(WORDS);
      while (word === state.word) word = pick(WORDS);
      state.word = word;
      state.letters = lettersFor(word, ctx.random);
      state.progress = 0;
      const others = state.alive.filter((id) => id !== playerId);
      state.target = others.length ? pick(others) : null;
    };

    const heatTick = (b: number) => {
      if (b !== bomb || state.finished || !state.holder) return;
      const left = explodesAt - ctx.now();
      const heat = left < fuse * 0.25 ? 2 : left < fuse * 0.55 ? 1 : 0;
      if (heat !== state.heat) {
        state.heat = heat;
        publish();
      }
      ctx.schedule(500, () => heatTick(b));
    };

    const newBomb = () => {
      bomb++;
      const b = bomb;
      fuse = FUSE_MIN_MS + ctx.random() * (FUSE_MAX_MS - FUSE_MIN_MS);
      explodesAt = ctx.now() + fuse;
      state.blast = null;
      state.heat = 0;
      give(pick(state.alive));
      publish();
      ctx.schedule(fuse, () => explode(b));
      ctx.schedule(500, () => heatTick(b));
    };

    const explode = (b: number) => {
      if (b !== bomb || state.finished || !state.holder) return;
      const victim = state.holder;
      state.alive = state.alive.filter((id) => id !== victim);
      state.out.push(victim);
      state.blast = { playerId: victim, at: ctx.now() };
      state.holder = null;
      state.target = null;
      state.heat = 0;
      if (state.alive.length <= 1) {
        state.finished = true;
        publish();
        // Le dernier debout gagne, puis les éliminés du plus tardif au plus précoce.
        ctx.schedule(BLAST_PAUSE_MS, () => ctx.finish([...state.alive.map((id) => [id]), ...[...state.out].reverse().map((id) => [id])]));
        return;
      }
      publish();
      ctx.schedule(BLAST_PAUSE_MS, newBomb);
    };

    return {
      start() {
        publish();
        ctx.schedule(1200, newBomb);
      },

      input(playerId, raw) {
        const input = raw as Partial<BombeInput> | null;
        if (state.finished || playerId !== state.holder || !input || input.pass !== state.pass) return;
        if (typeof input.letter !== "number" || !Number.isInteger(input.letter)) return;
        const letter = state.letters[input.letter];
        if (letter === undefined) return;
        if (letter === state.word[state.progress]) {
          state.progress++;
          if (state.progress >= state.word.length && state.target) give(state.target);
        } else {
          // Mauvaise lettre : on recommence le mot.
          state.progress = 0;
        }
        publish();
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let handled = "";
    let current: BombeState | null = null;
    const tap = (pass: number) => {
      const s = current;
      if (!s || s.finished || s.holder !== ctx.player.id || s.pass !== pass) return;
      const wanted = s.word[s.progress]!;
      const right = ctx.random() < 0.6 + skill.accuracy * 0.38;
      const index = right ? s.letters.indexOf(wanted) : Math.floor(ctx.random() * s.letters.length);
      ctx.send({ pass, letter: index });
      ctx.schedule(Math.max(140, gaussian(ctx.random, 520 / skill.speed, 90 + skill.chaos * 350)), () => tap(pass));
    };
    return {
      onState(state) {
        current = state;
        if (state.holder !== ctx.player.id || state.finished) return;
        const key = `${state.pass}`;
        if (handled === key) return;
        handled = key;
        // Le temps de voir qu'on a la bombe et de lire le mot.
        ctx.schedule(Math.max(350, gaussian(ctx.random, 900 / skill.speed, 200 + skill.chaos * 600)), () => tap(state.pass));
      },
    };
  },
});
