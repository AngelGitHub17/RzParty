import "./style.css";
import { everyFrame, h, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { TRI_DURATION_MS, TRI_SETS, type TriPrivate, type TriState } from "./types.ts";

/** « Tri éclair » : toucher les nombres dans l'ordre croissant. */
export function triView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: TriState | null = null;
  let current: TriPrivate | null = null;
  const bar = timeBar(ctx.serverNow);
  const info = h("p", { class: "tri__info", attrs: { "aria-live": "polite" } });
  const grid = h("div", { class: "tri__grid" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg tri tri--${ctx.layout}` }, bar.el, interactive ? h("div", { class: "tri__work" }, info, grid) : null, ctx.layout === "pad" ? null : lanes));
  const stop = everyFrame(() => current && grid.classList.toggle("is-locked", ctx.serverNow() < current.lockedUntil));

  function renderPrivate(): void {
    if (!current) return;
    const c = current;
    info.textContent = c.last === "faux" ? "Raté ! La série recommence." : `Série ${c.set + 1}/${TRI_SETS} : du plus petit au plus grand`;
    info.classList.toggle("is-faux", c.last === "faux");
    grid.style.setProperty("--cols", String(c.numbers.length > 6 ? 4 : 3));
    grid.replaceChildren(
      ...c.numbers.map((n) =>
        h("button", {
          class: `tri__num${c.done.includes(n) ? " is-done" : ""}`,
          attrs: { type: "button", disabled: c.done.includes(n) },
          text: String(n),
          on: { pointerdown: (e) => (e.preventDefault(), !c.done.includes(n) && ctx.serverNow() >= c.lockedUntil && ctx.send({ set: c.set, value: n })) },
        }),
      ),
    );
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - TRI_DURATION_MS, s.endsAt);
    const mine = ctx.me ? s.progress[ctx.me] : undefined;
    if (interactive && mine && mine.sets >= TRI_SETS) {
      const rank = s.finishers.indexOf(ctx.me!) + 1;
      info.textContent = `Terminé ! ${rank === 1 ? "1er" : `${rank}e`}`;
      grid.replaceChildren();
    } else if (interactive && s.finished) {
      info.textContent = "Temps écoulé !";
      grid.replaceChildren();
    }
    if (ctx.layout !== "pad")
      scoreLanes(lanes, ctx.players, {
        score: (id) => s.progress[id]?.sets ?? 0,
        max: TRI_SETS,
        me: ctx.me,
        avatar: ctx.avatar,
        label: (_, n) => `${n}/${TRI_SETS}`,
        done: (id) => s.finishers.includes(id),
      });
  }

  return {
    update(next) {
      state = next as TriState;
      render();
    },
    updatePrivate(data) {
      current = data as TriPrivate;
      if (!state?.finished) renderPrivate();
      render();
    },
    destroy() {
      bar.destroy();
      stop();
    },
  };
}
