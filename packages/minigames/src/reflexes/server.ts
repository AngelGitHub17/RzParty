import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import {
  REFLEX_HUMAN_MIN_MS,
  REFLEX_ROUNDS,
  outcomeCost,
  type ReflexInput,
  type ReflexOutcome,
  type ReflexState,
} from "./types.ts";

/** Écart toléré entre le temps mesuré par le navigateur et le temps vu par le serveur (réseau local). */
const NETWORK_SLACK_MS = 400;
/** Durée laissée pour réagir après le signal. */
const GO_WINDOW_MS = 1800;

export default defineMiniGame<ReflexState, never, ReflexInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: ReflexState = {
      turn: 0,
      phase: "wait",
      signal: 0,
      outcomes: Object.fromEntries(ids.map((id) => [id, []])),
      totals: Object.fromEntries(ids.map((id) => [id, 0])),
    };
    let goAt = 0;
    let turnClosed = false;

    const publish = () => ctx.publish(structuredClone(state));
    const record = (id: string, outcome: ReflexOutcome) => {
      const list = state.outcomes[id]!;
      if (list[state.turn - 1] !== undefined) return false;
      list[state.turn - 1] = outcome;
      return true;
    };
    const everyoneDone = () => ids.every((id) => state.outcomes[id]![state.turn - 1] !== undefined);

    function startTurn() {
      state.turn++;
      state.phase = "wait";
      turnClosed = false;
      publish();
      const delay = 1500 + ctx.random() * 3000;
      const turn = state.turn;
      ctx.schedule(delay, () => {
        if (state.turn !== turn) return;
        if (everyoneDone()) return closeTurn(); // tout le monde a fait un faux départ
        state.phase = "go";
        state.signal++;
        goAt = ctx.now();
        publish();
        ctx.schedule(GO_WINDOW_MS, closeTurn);
      });
    }

    function closeTurn() {
      if (turnClosed) return;
      turnClosed = true;
      for (const id of ids) {
        if (state.outcomes[id]![state.turn - 1] === undefined) state.outcomes[id]![state.turn - 1] = { kind: "miss" };
        state.totals[id] = state.outcomes[id]!.reduce((sum, o) => sum + outcomeCost(o), 0);
      }
      state.phase = "done";
      publish();
      ctx.schedule(2200, () => {
        if (state.turn < REFLEX_ROUNDS) startTurn();
        else {
          const records: Record<string, Record<string, number>> = {};
          for (const id of ids) {
            const times = state.outcomes[id]!.flatMap((o) => (o?.kind === "time" ? [o.ms] : []));
            if (times.length) records[id] = { reaction: Math.min(...times) };
          }
          ctx.finish(rankBy(ids, (id) => id, (a, b) => state.totals[a]! - state.totals[b]!), records);
        }
      });
    }

    return {
      start: startTurn,
      input(playerId, raw) {
        const input = raw as Partial<ReflexInput> | null;
        if (!input || input.kind !== "tap" || turnClosed || !ids.includes(playerId)) return;

        if (state.phase === "wait") {
          if (record(playerId, { kind: "false-start" })) publish();
        } else if (state.phase === "go" && input.signal === state.signal) {
          const elapsed = ctx.now() - goAt;
          const claimed = typeof input.reactionMs === "number" && Number.isFinite(input.reactionMs) ? input.reactionMs : elapsed;
          // Le navigateur mesure le temps (équité malgré le réseau), le serveur vérifie qu'il est plausible.
          const ms = Math.round(Math.min(Math.max(claimed, elapsed - NETWORK_SLACK_MS), elapsed));
          const outcome: ReflexOutcome = ms < REFLEX_HUMAN_MIN_MS ? { kind: "false-start" } : { kind: "time", ms };
          if (record(playerId, outcome)) publish();
        } else {
          return;
        }
        if (everyoneDone()) ctx.schedule(300, closeTurn);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let plannedTurn = 0;
    let plannedSignal = 0;
    let jumpedTurn = 0;

    return {
      onState(state) {
        if (state.phase === "wait" && state.turn !== plannedTurn) {
          plannedTurn = state.turn;
          // Faux départ : rare, plus fréquent chez les bots imprudents ou détraqués.
          const falseStartChance = (1 - skill.accuracy) * 0.35 + skill.chaos * 0.08;
          if (ctx.random() < falseStartChance) {
            jumpedTurn = state.turn;
            ctx.schedule(400 + ctx.random() * 1800, () => ctx.send({ kind: "tap", signal: state.signal }));
          }
        }
        if (state.phase === "go" && state.signal !== plannedSignal && jumpedTurn !== state.turn) {
          plannedSignal = state.signal;
          const glitchy = ctx.random() < skill.chaos * 0.5;
          const ms = glitchy
            ? 160 + ctx.random() * 1000
            : Math.max(170, gaussian(ctx.random, 430 / skill.speed, 60 + skill.chaos * 120));
          ctx.schedule(ms, () => ctx.send({ kind: "tap", signal: state.signal, reactionMs: ms }));
        }
      },
    };
  },
});
