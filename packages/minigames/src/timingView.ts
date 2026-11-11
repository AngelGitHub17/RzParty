import "./timing.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, everyFrame, h, mount3D, scoreLanes } from "./kit.ts";
import type { Timing3D, Timing3DFactory } from "./three/timing3d.ts";
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
  /** Version 3D du décor (chargée à la demande ; le dessin 2D reste si la 3D n'est pas disponible). */
  scene3d?: () => Promise<{ default: Timing3DFactory<P> }>;
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
  const box = h("div", { class: "mg3d-box tm__box" }, opts.stage);
  let scene: Timing3D<P> | null = null;
  let gone = false;
  if (opts.scene3d) {
    mount3D(box, opts.scene3d, (mod, host) => {
      if (gone) return false;
      scene = mod.default(host);
      scene.setPlayer(ctx.me ? (ctx.avatarData?.(ctx.me) ?? null) : null);
      return true;
    });
  }
  const draw: TimingViewOptions<P>["draw"] = (...args) => (scene ? scene.draw(...args) : opts.draw(...args));
  root.append(h("div", { class: `mg tm tm--${name} tm--${ctx.layout}` }, title, h("div", { class: "tm__stage" }, box), interactive ? button : null, results, ctx.layout === "pad" ? null : lanes));
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
      const best = state.phase === "result" && state.results ? Object.entries(state.results).filter(([, r]) => r.t !== null).sort(([, a], [, b]) => b.score - a.score)[0] : undefined;
      const replay = best?.[1].t ?? null;
      // En 3D, on montre le personnage de celui dont on rejoue l'essai.
      scene?.setPlayer(best ? (ctx.avatarData?.(best[0]) ?? null) : null);
      if (replay !== null) draw(replay + (performance.now() - resultShownAt), state.params, replay, state.phase, true);
      else draw(t, state.params, null, state.phase, true);
      return;
    }
    draw(t, state.params, pressedRound === state.round ? pressedAt : null, state.phase, false);
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
      gone = true;
      scene?.destroy();
      stop();
      window.removeEventListener("keydown", onKey);
    },
  };
}
