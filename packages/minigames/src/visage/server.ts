import { AVATAR_COLORS, gaussian, randomAvatar, type Avatar } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, tipCheater } from "../contract.ts";
import { definition } from "./definition.ts";
import { FACE_COUNT, FACE_FIND_MS, FACE_REVEAL_MS, FACE_ROUNDS, FACE_SHOW_MS, type FaceInput, type FaceState } from "./types.ts";

const POINTS = [3, 2];

/** Un sosie : le même personnage avec 1 ou 2 détails changés (plus de détails aux premières manches). */
function lookalike(target: Avatar, random: () => number, changes: number): Avatar {
  const other = randomAvatar(random);
  const a = { ...target };
  const keys: (keyof Avatar)[] = ["body", "accent", "shape", "eyes", "mouth", "hat", "extra"];
  const shuffled = [...keys].sort(() => random() - 0.5);
  let done = 0;
  for (const k of shuffled) {
    if (done >= changes) break;
    if (JSON.stringify(other[k]) === JSON.stringify(a[k])) continue;
    (a as Record<string, unknown>)[k] = other[k];
    done++;
  }
  if (!done) a.body = (a.body + 1) % AVATAR_COLORS.length;
  return a;
}

export default defineMiniGame<FaceState, null, FaceInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: FaceState = {
      round: 0,
      phase: "show",
      phaseEndsAt: 0,
      target: null,
      crowd: null,
      answer: null,
      correct: [],
      wrong: [],
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    const found: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let target: Avatar = randomAvatar(ctx.random);
    let crowd: Avatar[] = [];
    let answer = 0;
    let gen = 0;
    const answered = new Set<string>();
    const publish = () => ctx.publish(structuredClone(state));

    const show = () => {
      if (state.round >= FACE_ROUNDS) return end();
      state.round++;
      gen++;
      answered.clear();
      target = randomAvatar(ctx.random);
      const changes = state.round <= 2 ? 2 : 1;
      const seen = new Set([JSON.stringify(target)]);
      crowd = [];
      while (crowd.length < FACE_COUNT - 1) {
        const l = lookalike(target, ctx.random, changes);
        const key = JSON.stringify(l);
        if (seen.has(key)) continue;
        seen.add(key);
        crowd.push(l);
      }
      answer = Math.floor(ctx.random() * FACE_COUNT);
      crowd.splice(answer, 0, target);
      Object.assign(state, { phase: "show", target, crowd: null, answer: null, correct: [], wrong: [], phaseEndsAt: ctx.now() + FACE_SHOW_MS });
      publish();
      const g = gen;
      ctx.schedule(FACE_SHOW_MS, () => {
        Object.assign(state, { phase: "find", target: null, crowd, phaseEndsAt: ctx.now() + FACE_FIND_MS });
        tipCheater(ctx, `C'est le n°${answer + 1} (en comptant depuis le haut à gauche)`);
        publish();
        ctx.schedule(FACE_FIND_MS, () => g === gen && reveal());
      });
    };

    const reveal = () => {
      if (state.phase !== "find") return;
      Object.assign(state, { phase: "reveal", target, answer, phaseEndsAt: ctx.now() + FACE_REVEAL_MS });
      publish();
      ctx.schedule(FACE_REVEAL_MS, show);
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.scores[b]! - state.scores[a]!),
        Object.fromEntries(ids.map((id) => [id, { trouves: found[id]! }])),
      );
    };

    return {
      start: show,
      input(playerId, raw) {
        const input = raw as Partial<FaceInput> | null;
        if (state.phase !== "find" || !ids.includes(playerId) || !input || input.round !== state.round || answered.has(playerId)) return;
        if (!Number.isInteger(input.pick) || input.pick! < 0 || input.pick! >= FACE_COUNT) return;
        answered.add(playerId);
        if (input.pick === answer) {
          state.scores[playerId]! += POINTS[state.correct.length] ?? 1;
          state.correct.push(playerId);
          found[playerId]!++;
        } else state.wrong.push(playerId);
        publish();
        if (answered.size === ids.length) ctx.schedule(400, reveal);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let played = 0;
    let target: string | null = null;
    return {
      onState(state) {
        if (state.phase === "show" && state.target) target = JSON.stringify(state.target);
        if (state.phase !== "find" || !state.crowd || played === state.round) return;
        played = state.round;
        const right = state.crowd.findIndex((a) => JSON.stringify(a) === target);
        const ok = ctx.random() < skill.accuracy * 0.85;
        const pick = ok ? right : Math.floor(ctx.random() * state.crowd.length);
        const round = state.round;
        ctx.schedule(Math.max(900, gaussian(ctx.random, 3000 / skill.speed, 600 + skill.chaos * 1500)), () => ctx.send({ round, pick }));
      },
    };
  },
});
