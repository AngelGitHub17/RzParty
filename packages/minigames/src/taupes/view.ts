import "./style.css";
import { h, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { HOLES, TAUPES_DURATION_MS, type TaupesState } from "./types.ts";

/** « Tape-taupe » : 9 trous, les mêmes taupes pour tout le monde. */
export function taupesView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: TaupesState | null = null;
  const bar = timeBar(ctx.serverNow);
  const mine = h("p", { class: "mole__mine" });
  const lanes = h("ol", {});
  const holes = Array.from({ length: HOLES }, (_, i) =>
    h(
      interactive ? "button" : "div",
      {
        class: "mole__hole",
        attrs: interactive ? { type: "button", "aria-label": `Trou ${i + 1}` } : {},
        on: interactive ? { pointerdown: (e: Event) => (e.preventDefault(), whack(i)) } : {},
      },
      h("span", { class: "mole__critter", attrs: { "aria-hidden": "true" } }, h("span", { class: "mole__eyes" }), h("span", { class: "mole__nose" })),
    ),
  );
  const grid = h("div", { class: "mole__grid" }, ...holes);
  // Clavier : pavé numérique (7 8 9 / 4 5 6 / 1 2 3) ou chiffres.
  const KEYS: Record<string, number> = { "7": 0, "8": 1, "9": 2, "4": 3, "5": 4, "6": 5, "1": 6, "2": 7, "3": 8 };
  const onKey = (e: KeyboardEvent) => {
    const i = KEYS[e.key];
    if (i === undefined || !interactive) return;
    e.preventDefault();
    whack(i);
  };
  window.addEventListener("keydown", onKey);

  root.append(h("div", { class: `mg mole mole--${ctx.layout}` }, bar.el, interactive ? mine : null, h("div", { class: "mole__stage" }, grid, ctx.layout === "pad" ? null : lanes)));

  function whack(i: number): void {
    if (!state || state.finished) return;
    const now = ctx.serverNow();
    const mole = state.moles.find((m) => m.hole === i && m.until > now - 150);
    const already = ctx.me ? state.hits[ctx.me]?.includes(mole?.id ?? -1) : false;
    if (already) return;
    ctx.send(mole ? { hole: i, mole: mole.id } : { hole: i });
    const hole = holes[i]!;
    hole.classList.remove("is-bonk", "is-miss");
    void hole.offsetWidth;
    hole.classList.add(mole ? "is-bonk" : "is-miss");
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - TAUPES_DURATION_MS, s.endsAt);
    const hit = new Set(ctx.me ? s.hits[ctx.me] : []);
    holes.forEach((hole, i) => {
      const mole = s.moles.find((m) => m.hole === i);
      hole.classList.toggle("is-up", Boolean(mole) && !hit.has(mole!.id));
      hole.classList.toggle("is-golden", Boolean(mole?.golden));
    });
    if (ctx.me) mine.textContent = `${s.scores[ctx.me] ?? 0} point${(s.scores[ctx.me] ?? 0) > 1 ? "s" : ""}${s.finished ? " · Terminé !" : ""}`;
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as TaupesState;
      render();
    },
    destroy() {
      bar.destroy();
      window.removeEventListener("keydown", onKey);
    },
  };
}
