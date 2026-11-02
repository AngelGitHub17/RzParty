import "./timing.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, everyFrame, h, scoreLanes } from "./kit.ts";
import type { MiniGameView, MiniGameViewContext } from "./client.ts";
import { localStart, type TimingState } from "./timing.ts";

export interface TimingViewOptions<P> {
  /** Texte du gros bouton (« SAUTER », « LÂCHER »…). */
  button: string;
  /** Consigne de la manche. */
  instruction(params: P): string;
  /** Décor animé (SVG ou HTML) : `draw` est appelé à chaque image. */
  stage: HTMLElement | SVGSVGElement;
  /**
   * Dessine la scène. `t` : temps écoulé depuis le départ (null avant), `pressedAt` : instant de mon appui,
   * `phase` : phase de la manche.
   */
  draw(t: number | null, params: P, pressedAt: number | null, phase: TimingState<P>["phase"], spectator: boolean): void;
  /** Étiquette du total dans le classement. */
  totalLabel?(n: number): string;
}

/** Vue commune des jeux « un appui au bon moment ». */
export function timingView<P>(root: HTMLElement, ctx: MiniGameViewContext, name: string, opts: TimingViewOptions<P>): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: TimingState<P> | null = null;
  let start = 0;
  let startedRound = 0;
  let pressedAt: number | null = null;
  let pressedRound = 0;
  let resultShownAt = 0;
  let resultRound = 0;
  const title = h("p", { class: "tm__title", attrs: { "aria-live": "polite" } });
  const button = h("button", { class: "tm__btn", attrs: { type: "button" }, text: opts.button, on: { pointerdown: (e) => (e.preventDefault(), press()) } });
  const results = h("ul", { class: "tm__results" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg tm tm--${name} tm--${ctx.layout}` }, title, h("div", { class: "tm__stage" }, opts.stage), interactive ? button : null, results, ctx.layout === "pad" ? null : lanes));
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter") && interactive) {
      e.preventDefault();
      press();
    }
  };
  window.addEventListener("keydown", onKey);

  function press(): void {
    if (!state || state.phase !== "run" || pressedRound === state.round) return;
    pressedRound = state.round;
    pressedAt = performance.now() - start;
    ctx.send({ round: state.round, t: Math.round(pressedAt) });
    render();
  }

  const stop = everyFrame(() => {
    if (!state) return;
    const t = state.phase === "run" || state.phase === "result" ? performance.now() - start : null;
    if (!interactive) {
      // Écran commun : à la fin de la manche, on rejoue le meilleur essai.
      const best = state.phase === "result" && state.results ? Object.values(state.results).filter((r) => r.t !== null).sort((a, b) => b.score - a.score)[0] : undefined;
      const replay = best?.t ?? null;
      if (replay !== null) opts.draw(replay + (performance.now() - resultShownAt), state.params, replay, state.phase, true);
      else opts.draw(t, state.params, null, state.phase, true);
      return;
    }
    opts.draw(t, state.params, pressedRound === state.round ? pressedAt : null, state.phase, false);
  });

  function render(): void {
    if (!state) return;
    const s = state;
    if (s.phase === "run" && startedRound !== s.round) {
      startedRound = s.round;
      start = localStart(s.startedAt, ctx.serverNow);
    }
    if (pressedRound !== s.round) pressedAt = null;
    if (s.phase === "result" && resultRound !== s.round) {
      resultRound = s.round;
      resultShownAt = performance.now();
    }
    title.textContent = s.phase === "done" ? "Terminé !" : `Manche ${s.round}/${s.rounds} · ${s.phase === "ready" ? "Prêt…" : opts.instruction(s.params)}`;
    button.disabled = s.phase !== "run" || pressedRound === s.round;
    clear(results);
    if (s.phase === "result" && s.results) {
      for (const p of ctx.players) {
        const r = s.results[p.id];
        if (!r) continue;
        results.append(h("li", { style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(p.id, 26), h("strong", { text: r.label })));
      }
    }
    if (ctx.layout !== "pad")
      scoreLanes(lanes, ctx.players, { score: (id) => s.totals[id] ?? 0, me: ctx.me, avatar: ctx.avatar, label: (_, n) => (opts.totalLabel ? opts.totalLabel(n) : String(Math.round(n))) });
  }

  return {
    update(next) {
      state = next as TimingState<P>;
      render();
    },
    destroy() {
      stop();
      window.removeEventListener("keydown", onKey);
    },
  };
}
