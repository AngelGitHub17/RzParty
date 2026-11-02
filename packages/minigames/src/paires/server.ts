import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { FRUITS, MISMATCH_MS, PAIRS, PAIRS_DURATION_MS, type PairsInput, type PairsPrivate, type PairsState } from "./types.ts";

export default defineMiniGame<PairsState, PairsPrivate, PairsInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    // Le même jeu de cartes pour tout le monde.
    const fruits = [...FRUITS].sort(() => ctx.random() - 0.5).slice(0, PAIRS);
    const deck = [...fruits, ...fruits].sort(() => ctx.random() - 0.5);
    const state: PairsState = { endsAt: 0, found: Object.fromEntries(ids.map((id) => [id, 0])), finishers: [], finished: false };
    const boards = Object.fromEntries(
      ids.map((id) => [id, { found: deck.map(() => false), open: [] as number[], lockedUntil: 0, moves: 0, lastPairAt: Infinity }]),
    );
    const send = (id: string) => {
      const b = boards[id]!;
      ctx.sendTo(id, { cards: deck.map((f, i) => (b.found[i] || b.open.includes(i) ? f : null)), found: [...b.found], lockedUntil: b.lockedUntil, moves: b.moves });
    };
    const end = () => {
      if (state.finished) return;
      state.finished = true;
      ctx.publish(structuredClone(state));
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => {
          const fa = state.finishers.indexOf(a), fb = state.finishers.indexOf(b);
          if (fa >= 0 || fb >= 0) return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb);
          return state.found[b]! - state.found[a]! || (state.found[a] ? boards[a]!.lastPairAt - boards[b]!.lastPairAt : 0);
        }),
        Object.fromEntries(state.finishers.map((id) => [id, { coups: boards[id]!.moves }])),
      );
    };

    return {
      start() {
        state.endsAt = ctx.now() + PAIRS_DURATION_MS;
        ctx.publish(structuredClone(state));
        for (const id of ids) send(id);
        ctx.schedule(PAIRS_DURATION_MS, end);
      },
      input(playerId, raw) {
        const input = raw as Partial<PairsInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || !Number.isInteger(input.card)) return;
        const b = boards[playerId]!;
        const c = input.card!;
        const now = ctx.now();
        if (c < 0 || c >= deck.length || b.found[c] || b.open.includes(c) || now < b.lockedUntil || state.finishers.includes(playerId)) return;
        b.open.push(c);
        if (b.open.length === 2) {
          b.moves++;
          const [x, y] = b.open as [number, number];
          if (deck[x] === deck[y]) {
            b.found[x] = b.found[y] = true;
            b.open = [];
            b.lastPairAt = now;
            state.found[playerId]!++;
            if (state.found[playerId] === PAIRS) {
              state.finishers.push(playerId);
              if (state.finishers.length === ids.length) ctx.schedule(500, end);
            }
            ctx.publish(structuredClone(state));
          } else {
            // Raté : on laisse voir les deux cartes, puis elles se retournent.
            b.lockedUntil = now + MISMATCH_MS;
            send(playerId);
            ctx.schedule(MISMATCH_MS, () => {
              b.open = [];
              send(playerId);
            });
            return;
          }
        }
        send(playerId);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    const memory = new Map<number, string>();
    let pending = false;
    let board: PairsPrivate | null = null;
    const play = () => {
      pending = false;
      const b = board;
      if (!b || ctx.now() < b.lockedUntil) return;
      b.cards.forEach((f, i) => f && !b.found[i] && memory.set(i, f));
      const hidden = b.cards.map((f, i) => (f === null ? i : -1)).filter((i) => i >= 0);
      const openNow = b.cards.map((f, i) => (f && !b.found[i] ? i : -1)).filter((i) => i >= 0);
      if (!hidden.length) return;
      let choice: number | undefined;
      const remembers = () => ctx.random() < skill.accuracy * 0.9;
      if (openNow.length === 1) {
        const want = b.cards[openNow[0]!];
        choice = [...memory].find(([i, f]) => f === want && i !== openNow[0] && hidden.includes(i))?.[0];
        if (choice !== undefined && !remembers()) choice = undefined;
      } else {
        // Une paire déjà connue ?
        const seen = new Map<string, number>();
        for (const [i, f] of memory) {
          if (!hidden.includes(i)) continue;
          if (seen.has(f) && remembers()) choice = seen.get(f);
          seen.set(f, i);
        }
        if (choice === undefined) choice = hidden.find((i) => !memory.has(i));
      }
      if (choice === undefined) choice = hidden[Math.floor(ctx.random() * hidden.length)]!;
      ctx.send({ card: choice });
    };
    return {
      onState() {},
      onPrivate(data) {
        board = data;
        data.cards.forEach((f, i) => f && memory.set(i, f));
        if (pending) return;
        pending = true;
        const wait = Math.max(0, data.lockedUntil - ctx.now());
        ctx.schedule(wait + Math.max(280, gaussian(ctx.random, 700 / skill.speed, 120 + skill.chaos * 400)), play);
      },
    };
  },
});
