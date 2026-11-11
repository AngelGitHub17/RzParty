import "./style.css";
import { h, mount3D, scoreLanes, timeBar } from "../kit.ts";
import type { BanditsScene } from "./scene3d.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { BANDITS_DURATION_MS, WINDOWS, type BanditsState } from "./types.ts";

const BANDIT = `<svg viewBox="0 0 60 70" aria-hidden="true"><ellipse cx="30" cy="12" rx="26" ry="6" fill="#3a2414"/><rect x="16" y="2" width="28" height="12" rx="4" fill="#3a2414"/><circle cx="30" cy="30" r="15" fill="#e9b07a"/><rect x="14" y="24" width="32" height="8" rx="3" fill="#1e2a4a"/><circle cx="23" cy="28" r="2.5" fill="#fff"/><circle cx="37" cy="28" r="2.5" fill="#fff"/><path d="M18 36 h24 l-4 10 h-16z" fill="#c0392b"/><rect x="12" y="46" width="36" height="24" rx="8" fill="#5a3a22"/></svg>`;
const HABITANT = `<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M8 22 Q30 0 52 22 z" fill="#f2b705"/><circle cx="30" cy="30" r="15" fill="#f7cba0"/><circle cx="24" cy="28" r="2.2" fill="#1e2a4a"/><circle cx="36" cy="28" r="2.2" fill="#1e2a4a"/><path d="M23 36 q7 6 14 0" stroke="#1e2a4a" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="20" cy="34" r="3" fill="#f28aa8" opacity=".6"/><circle cx="40" cy="34" r="3" fill="#f28aa8" opacity=".6"/><rect x="12" y="46" width="36" height="24" rx="8" fill="#2f7bef"/></svg>`;

function svgFrom(markup: string): Node {
  const t = document.createElement("template");
  t.innerHTML = markup;
  return t.content.firstChild!;
}

/** « Ruée vers l'Ouest » : la façade d'un saloon avec 8 fenêtres. */
export function banditsView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: BanditsState | null = null;
  const bar = timeBar(ctx.serverNow);
  const mine = h("p", { class: "west__mine" });
  const lanes = h("ol", {});
  const windows = Array.from({ length: WINDOWS }, (_, i) => {
    const bandit = h("span", { class: "west__fig west__fig--bandit" }, svgFrom(BANDIT));
    const habitant = h("span", { class: "west__fig west__fig--habitant" }, svgFrom(HABITANT));
    return h(
      interactive ? "button" : "div",
      { class: "west__window", attrs: interactive ? { type: "button", "aria-label": `Fenêtre ${i + 1}` } : {}, on: interactive ? { pointerdown: (e: Event) => (e.preventDefault(), shoot(i)) } : {} },
      bandit,
      habitant,
    );
  });
  const facade = h("div", { class: "west__facade" }, h("p", { class: "west__sign", text: "SALOON" }), h("div", { class: "west__windows" }, ...windows));
  // En 3D quand c'est possible (la façade 2D reste là sinon).
  const box = h("div", { class: "mg3d-box west__box" }, facade);
  let scene: BanditsScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ BanditsScene }, host) => {
    if (gone) return false;
    scene = new BanditsScene(host, interactive, (i) => shoot(i));
    render();
    return true;
  });
  root.append(h("div", { class: `mg west west--${ctx.layout}` }, bar.el, interactive ? mine : null, h("div", { class: "west__stage" }, box, ctx.layout === "pad" ? null : lanes)));

  function shoot(i: number): void {
    if (!state || state.finished) return;
    const p = state.popups.find((x) => x.window === i);
    if (!p) return;
    ctx.send({ popup: p.id });
    scene?.shot(i);
    const w = windows[i]!;
    w.classList.remove("is-shot");
    void w.offsetWidth;
    w.classList.add("is-shot");
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - BANDITS_DURATION_MS, s.endsAt);
    const hit = new Set(ctx.me ? s.hits[ctx.me] : []);
    windows.forEach((w, i) => {
      const p = s.popups.find((x) => x.window === i);
      const up = Boolean(p) && !hit.has(p!.id);
      w.classList.toggle("is-up", up);
      w.dataset.kind = p?.kind ?? "";
    });
    scene?.update(s, hit, ctx.serverNow());
    if (ctx.me) mine.textContent = `${s.scores[ctx.me] ?? 0} point${Math.abs(s.scores[ctx.me] ?? 0) > 1 ? "s" : ""}${s.finished ? " · Terminé !" : ""}`;
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as BanditsState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      bar.destroy();
    },
  };
}
