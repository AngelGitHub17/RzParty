/**
 * Moteur commun aux mini-jeux « d'un seul appui au bon moment » (tremplin, liane, photo…).
 * Chaque manche : préparation, puis une phase où chaque joueur appuie une fois ; le temps mesuré
 * par son appareil (vérifié par le serveur) donne un score. Les scores des manches s'additionnent
 * (ou on garde le meilleur).
 */
import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy, type MiniGameDefinition } from "./contract.ts";

export interface TimingState<P> {
  round: number;
  rounds: number;
  phase: "ready" | "run" | "result" | "done";
  /** Réglages de la manche (vitesse, durée…), les mêmes pour tous. */
  params: P;
  startedAt: number;
  phaseEndsAt: number;
  pressed: string[];
  /** Résultat de chaque joueur pour la manche (révélé à la phase « result »). */
  results: Record<string, { t: number | null; score: number; label: string }> | null;
  /** Total (ou meilleur score) par joueur. */
  totals: Record<string, number>;
}

export interface TimingInput {
  round: number;
  /** Temps entre l'affichage du départ et l'appui, mesuré par l'appareil. */
  t: number;
}

export interface TimingGame<P> {
  definition: MiniGameDefinition;
  rounds: number;
  readyMs: number;
  resultMs: number;
  /** Réglages d'une manche. */
  params(round: number, random: () => number): P;
  /** Durée maximale de la phase d'appui. */
  runMs(params: P): number;
  /** Score d'un appui à l'instant t (null = pas d'appui). */
  score(t: number | null, params: P): number;
  /** Texte du résultat (« 112 m », « Chute ! »…). */
  label(t: number | null, score: number, params: P): string;
  /** « sum » : on additionne les manches ; « best » : on garde la meilleure. */
  total: "sum" | "best";
  /** Instant idéal d'appui, pour les bots (ils visent autour). */
  ideal(params: P): number;
  /** Écart type de l'erreur d'un bot moyen, en millisecondes. */
  botSpread: number;
  record?: string;
}

export function defineTimingGame<P>(game: TimingGame<P>) {
  return defineMiniGame<TimingState<P>, null, TimingInput>({
    definition: game.definition,

    create(ctx) {
      const ids = ctx.players.map((p) => p.id);
      const state: TimingState<P> = {
        round: 0,
        rounds: game.rounds,
        phase: "ready",
        params: game.params(1, ctx.random),
        startedAt: 0,
        phaseEndsAt: 0,
        pressed: [],
        results: null,
        totals: Object.fromEntries(ids.map((id) => [id, 0])),
      };
      let presses: Record<string, number> = {};
      let gen = 0;
      const publish = () => ctx.publish(structuredClone(state));

      const ready = () => {
        if (state.round >= game.rounds) return end();
        state.round++;
        gen++;
        presses = {};
        Object.assign(state, { phase: "ready", params: game.params(state.round, ctx.random), pressed: [], results: null, phaseEndsAt: ctx.now() + game.readyMs });
        publish();
        const g = gen;
        ctx.schedule(game.readyMs, () => {
          state.phase = "run";
          state.startedAt = ctx.now();
          const run = game.runMs(state.params);
          state.phaseEndsAt = state.startedAt + run;
          publish();
          ctx.schedule(run + 300, () => g === gen && result());
        });
      };

      const result = () => {
        if (state.phase !== "run") return;
        const results: NonNullable<TimingState<P>["results"]> = {};
        for (const id of ids) {
          const t = id in presses ? presses[id]! : null;
          const score = game.score(t, state.params);
          results[id] = { t, score, label: game.label(t, score, state.params) };
          state.totals[id] = game.total === "sum" ? state.totals[id]! + score : Math.max(state.totals[id]!, score);
        }
        Object.assign(state, { phase: "result", results, phaseEndsAt: ctx.now() + game.resultMs });
        publish();
        ctx.schedule(game.resultMs, ready);
      };

      const end = () => {
        state.phase = "done";
        publish();
        ctx.finish(
          rankBy(ids, (id) => id, (a, b) => state.totals[b]! - state.totals[a]!),
          game.record ? Object.fromEntries(ids.map((id) => [id, { [game.record!]: Math.round(state.totals[id]!) }])) : undefined,
        );
      };

      return {
        start: ready,
        input(playerId, raw) {
          const input = raw as Partial<TimingInput> | null;
          if (state.phase !== "run" || !ids.includes(playerId) || !input || input.round !== state.round || playerId in presses) return;
          const server = ctx.now() - state.startedAt;
          // Le temps de l'appareil est plus précis ; on le garde s'il reste plausible.
          const t = typeof input.t === "number" && Number.isFinite(input.t) && input.t <= server + 150 && input.t >= server - 1500 ? input.t : server;
          presses[playerId] = Math.max(0, Math.round(t));
          state.pressed.push(playerId);
          publish();
          if (ids.every((id) => id in presses)) ctx.schedule(250, result);
        },
      };
    },

    bot(ctx) {
      const skill = botSkill(ctx.profile);
      let played = 0;
      return {
        onState(state) {
          if (state.phase !== "run" || played === state.round) return;
          played = state.round;
          const spread = game.botSpread * (1.4 - skill.accuracy) * 2 * (1 + skill.chaos);
          const t = Math.max(100, game.ideal(state.params) + gaussian(ctx.random, -spread * 0.3, spread));
          const round = state.round;
          ctx.schedule(t, () => ctx.send({ round, t }));
        },
      };
    },
  });
}

/** Côté navigateur : l'instant local du départ, recalé sur l'heure du serveur. */
export function localStart(startedAt: number, serverNow: () => number): number {
  return performance.now() - Math.max(0, serverNow() - startedAt);
}
