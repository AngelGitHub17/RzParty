import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import {
  LANDING_ROUNDS, LAND_MAX_MS, LAND_READY_MS, LAND_RESULT_MS, SAFE_SPEED, STEP_MS,
  landingScore, simulate, validToggles, type AlunissageInput, type AlunissageState,
} from "./types.ts";

/** Délai laissé aux dernières commandes avant de valider un atterrissage. */
const GRACE_MS = 800;

export default defineMiniGame<AlunissageState, null, AlunissageInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: AlunissageState = {
      round: 0,
      rounds: LANDING_ROUNDS,
      phase: "ready",
      startedAt: 0,
      phaseEndsAt: 0,
      toggles: {},
      landed: {},
      best: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    let gen = 0;
    let dirty = false;
    const publish = () => {
      dirty = false;
      ctx.publish(structuredClone(state));
    };

    const ready = () => {
      gen++;
      state.round++;
      state.phase = "ready";
      state.toggles = Object.fromEntries(ids.map((id) => [id, []]));
      state.landed = {};
      state.phaseEndsAt = ctx.now() + LAND_READY_MS;
      publish();
      const g = gen;
      ctx.schedule(LAND_READY_MS, () => g === gen && fly());
    };

    const fly = () => {
      state.phase = "fly";
      state.startedAt = ctx.now();
      state.phaseEndsAt = state.startedAt + LAND_MAX_MS;
      publish();
      const g = gen;
      const tick = () => {
        if (g !== gen) return;
        check(false);
        if (dirty) publish();
        if (state.phase === "fly") ctx.schedule(250, tick);
      };
      ctx.schedule(250, tick);
      ctx.schedule(LAND_MAX_MS + GRACE_MS, () => g === gen && check(true));
    };

    /** Valide les atterrissages terminés ; `force` à la fin du temps imparti. */
    const check = (force: boolean) => {
      if (state.phase !== "fly") return;
      const elapsed = ctx.now() - state.startedAt;
      for (const id of ids) {
        if (state.landed[id]) continue;
        const f = simulate(state.toggles[id]!, elapsed);
        if ((f.landedAt !== null && elapsed >= f.landedAt + GRACE_MS) || force) {
          const score = landingScore(f);
          state.landed[id] = { score, speed: Math.round(f.speed * 10) / 10, crashed: f.landedAt === null || f.speed > SAFE_SPEED };
          state.best[id] = Math.max(state.best[id]!, score);
          dirty = true;
        }
      }
      if (ids.every((id) => state.landed[id])) result();
    };

    const result = () => {
      gen++;
      state.phase = "result";
      state.phaseEndsAt = ctx.now() + LAND_RESULT_MS;
      publish();
      ctx.schedule(LAND_RESULT_MS, () => (state.round >= LANDING_ROUNDS ? end() : ready()));
    };

    const end = () => {
      state.phase = "done";
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => state.best[b]! - state.best[a]!),
        Object.fromEntries(ids.filter((id) => state.best[id]! > 0).map((id) => [id, { atterrissage: state.best[id]! }])),
      );
    };

    return {
      start: ready,
      input(playerId, raw) {
        const input = raw as Partial<AlunissageInput> | null;
        if (state.phase !== "fly" || !ids.includes(playerId) || !input || input.round !== state.round || state.landed[playerId]) return;
        if (!validToggles(input.toggles) || input.toggles.some((v) => v % STEP_MS !== 0)) return;
        const old = state.toggles[playerId]!;
        const next = input.toggles;
        // Les commandes déjà reçues ne changent plus ; les nouvelles ne peuvent être ni futures ni trop anciennes.
        if (next.length < old.length || old.some((v, i) => next[i] !== v)) return;
        const elapsed = ctx.now() - state.startedAt;
        const added = next.slice(old.length);
        if (added.some((v) => v > elapsed + 150 || v < elapsed - 1500)) return;
        state.toggles[playerId] = [...next];
        dirty = true;
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let planned = 0;
    return {
      onState(state) {
        if (state.phase !== "fly" || planned === state.round) return;
        planned = state.round;
        const round = state.round;
        // Pilote automatique : freine quand la chute dépasse une vitesse cible qui baisse près du sol.
        const care = 0.14 + (1 - skill.accuracy) * 0.25 + gaussian(ctx.random, 0, 0.02 + skill.chaos * 0.06);
        const floor = 0.6 + (1 - skill.accuracy) * 4 + ctx.random() * skill.chaos * 3;
        const toggles: number[] = [];
        let on = false;
        for (let t = 0; t < LAND_MAX_MS; t += 5 * STEP_MS) {
          const f = simulate(toggles, t);
          if (f.landedAt !== null) break;
          const want = f.speed > floor + f.alt * care;
          if (want !== on) {
            on = want;
            toggles.push(t);
          }
        }
        const sent: number[] = [];
        for (const t of toggles) {
          ctx.schedule(t + 30, () => {
            sent.push(t);
            ctx.send({ round, toggles: [...sent] });
          });
        }
      },
    };
  },
});
