import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, tipCheater } from "../contract.ts";
import { definition } from "./definition.ts";
import { STROOP_COLORS, STROOP_DURATION_MS, STROOP_PENALTY_MS, makeStroop, type StroopInput, type StroopPrivate, type StroopQuestion, type StroopState } from "./types.ts";

export default defineMiniGame<StroopState, StroopPrivate, StroopInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    // La même suite de questions pour tout le monde.
    const questions: StroopQuestion[] = [];
    const question = (i: number) => {
      while (questions.length <= i) questions.push(makeStroop(ctx.random));
      return questions[i]!;
    };
    const state: StroopState = {
      endsAt: 0,
      progress: Object.fromEntries(ids.map((id) => [id, { score: 0, errors: 0 }])),
      finished: false,
    };
    const index: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const lockedUntil: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const lastAt: Record<string, number> = Object.fromEntries(ids.map((id) => [id, Infinity]));
    const send = (id: string, last: StroopPrivate["last"]) => {
      ctx.sendTo(id, { index: index[id]!, question: question(index[id]!), lockedUntil: lockedUntil[id]!, last });
      if (id === ctx.cheater) tipCheater(ctx, `Encre : ${STROOP_COLORS.find((c) => c.id === question(index[id]!).ink)?.label ?? "?"}`);
    };

    return {
      start() {
        state.endsAt = ctx.now() + STROOP_DURATION_MS;
        ctx.publish(structuredClone(state));
        for (const id of ids) send(id, null);
        ctx.schedule(STROOP_DURATION_MS, () => {
          state.finished = true;
          ctx.publish(structuredClone(state));
          ctx.finish(
            rankBy(ids, (id) => id, (a, b) => {
              const pa = state.progress[a]!, pb = state.progress[b]!;
              const diff = pb.score - pa.score;
              if (diff) return diff;
              if (pa.score === 0) return 0;
              return lastAt[a]! - lastAt[b]!;
            }),
            Object.fromEntries(ids.map((id) => [id, { justes: state.progress[id]!.score }])),
          );
        });
      },

      input(playerId, raw) {
        const input = raw as Partial<StroopInput> | null;
        if (state.finished || !ids.includes(playerId) || !input || input.index !== index[playerId]) return;
        const now = ctx.now();
        if (now < lockedUntil[playerId]!) return;
        const p = state.progress[playerId]!;
        const correct = input.answer === question(index[playerId]!).ink;
        if (correct) {
          p.score++;
          lastAt[playerId] = now;
        } else {
          p.errors++;
          lockedUntil[playerId] = now + STROOP_PENALTY_MS;
        }
        index[playerId]!++;
        send(playerId, correct ? "juste" : "faux");
        ctx.publish(structuredClone(state));
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let answering = -1;
    return {
      onState() {},
      onPrivate(data) {
        if (data.index === answering) return;
        answering = data.index;
        // Le piège : un bot distrait répond la couleur du MOT.
        const right = ctx.random() < skill.accuracy * 0.95;
        const answer = right ? data.question.ink : data.question.word;
        const wait = Math.max(0, data.lockedUntil - ctx.now());
        const think = Math.max(450, gaussian(ctx.random, 1050 / skill.speed, 150 + skill.chaos * 500));
        ctx.schedule(wait + think, () => ctx.send({ index: data.index, answer }));
      },
    };
  },
});
