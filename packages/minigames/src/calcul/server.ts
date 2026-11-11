import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, tipCheater } from "../contract.ts";
import { definition } from "./definition.ts";
import { CALCUL_DURATION_MS, makeQuestion, type CalculInput, type CalculPrivate, type CalculQuestion, type CalculState } from "./types.ts";

export default defineMiniGame<CalculState, CalculPrivate, CalculInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    // Tout le monde reçoit la même suite de calculs : la course est équitable.
    const questions: CalculQuestion[] = [];
    const question = (i: number) => {
      while (questions.length <= i) questions.push(makeQuestion(ctx.random, questions.length));
      return questions[i]!;
    };

    const state: CalculState = {
      endsAt: 0,
      progress: Object.fromEntries(ids.map((id) => [id, { score: 0, answered: 0 }])),
      finished: false,
    };
    const index: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const lastCorrectAt: Record<string, number> = Object.fromEntries(ids.map((id) => [id, Infinity]));

    const sendQuestion = (id: string, last: CalculPrivate["last"]) => {
      ctx.sendTo(id, { index: index[id]!, question: question(index[id]!).text, last });
      if (id === ctx.cheater) tipCheater(ctx, `Réponse : ${question(index[id]!).answer}`);
    };

    return {
      start() {
        state.endsAt = ctx.now() + CALCUL_DURATION_MS;
        ctx.publish(structuredClone(state));
        for (const id of ids) sendQuestion(id, null);
        ctx.schedule(CALCUL_DURATION_MS, () => {
          state.finished = true;
          ctx.publish(structuredClone(state));
          ctx.finish(
            rankBy(ids, (id) => id, (a, b) => {
              const diff = state.progress[b]!.score - state.progress[a]!.score;
              if (diff !== 0) return diff;
              if (state.progress[a]!.score === 0) return 0;
              // À score égal, celui qui a atteint ce score le premier passe devant.
              return lastCorrectAt[a]! - lastCorrectAt[b]!;
            }),
            Object.fromEntries(ids.map((id) => [id, { bonnes: state.progress[id]!.score }])),
          );
        });
      },

      input(playerId, raw) {
        const input = raw as Partial<CalculInput> | null;
        if (state.finished || !ids.includes(playerId) || !input) return;
        if (input.index !== index[playerId] || typeof input.answer !== "number" || !Number.isFinite(input.answer)) return;
        const correct = input.answer === question(index[playerId]!).answer;
        const p = state.progress[playerId]!;
        p.answered++;
        if (correct) {
          p.score++;
          lastCorrectAt[playerId] = ctx.now();
        }
        index[playerId]!++;
        sendQuestion(playerId, correct ? "juste" : "faux");
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
        const correct = evaluate(data.question);
        const right = ctx.random() < skill.accuracy;
        const answer = right ? correct : correct + (ctx.random() < 0.5 ? -1 : 1) * (1 + Math.floor(ctx.random() * 3));
        const hard = data.question.includes("×") ? 1.4 : 1;
        const think = Math.max(700, gaussian(ctx.random, (2600 * hard) / skill.speed, 500 + skill.chaos * 1500));
        ctx.schedule(think, () => ctx.send({ index: data.index, answer }));
      },
    };
  },
});

/** Calcule une expression du type « 7 × 3 + 4 » (uniquement les formes produites par makeQuestion). */
function evaluate(text: string): number {
  const tokens = text.split(" ");
  const nums: number[] = [];
  const ops: string[] = [];
  tokens.forEach((t, i) => (i % 2 === 0 ? nums.push(Number(t)) : ops.push(t)));
  // Multiplications d'abord.
  for (let i = 0; i < ops.length; ) {
    if (ops[i] === "×") {
      nums.splice(i, 2, nums[i]! * nums[i + 1]!);
      ops.splice(i, 1);
    } else i++;
  }
  return ops.reduce((acc, op, i) => (op === "+" ? acc + nums[i + 1]! : acc - nums[i + 1]!), nums[0]!);
}
