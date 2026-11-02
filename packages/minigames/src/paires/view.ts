import "./style.css";
import { h, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { PAIRS, PAIRS_DURATION_MS, type PairsPrivate, type PairsState } from "./types.ts";

/** « Paires de fruits » : un jeu de 16 cartes par joueur. */
export function pairesView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: PairsState | null = null;
  let board: PairsPrivate | null = null;
  const bar = timeBar(ctx.serverNow);
  const info = h("p", { class: "pairs__info" });
  const grid = h("div", { class: "pairs__grid" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg pairs pairs--${ctx.layout}` }, bar.el, interactive ? h("div", { class: "pairs__work" }, info, grid) : null, ctx.layout === "pad" ? null : lanes));

  function renderBoard(): void {
    if (!board) return;
    const b = board;
    grid.replaceChildren(
      ...b.cards.map((f, i) =>
        h(
          "button",
          {
            class: `pairs__card${f ? " is-open" : ""}${b.found[i] ? " is-found" : ""}`,
            attrs: { type: "button", "aria-label": f ? f : `Carte ${i + 1}`, disabled: b.found[i] },
            on: { pointerdown: (e) => (e.preventDefault(), !f && ctx.send({ card: i })) },
          },
          h("span", { text: f ?? "" }),
        ),
      ),
    );
    info.textContent = `${b.found.filter(Boolean).length / 2}/${PAIRS} paires · ${b.moves} coups`;
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - PAIRS_DURATION_MS, s.endsAt);
    if (interactive && ctx.me && s.finishers.includes(ctx.me)) info.textContent = `Toutes les paires ! ${s.finishers.indexOf(ctx.me) === 0 ? "1er" : `${s.finishers.indexOf(ctx.me) + 1}e`}`;
    if (ctx.layout !== "pad")
      scoreLanes(lanes, ctx.players, { score: (id) => s.found[id] ?? 0, max: PAIRS, me: ctx.me, avatar: ctx.avatar, label: (_, n) => `${n}/${PAIRS}`, done: (id) => s.finishers.includes(id) });
  }

  return {
    update(next) {
      state = next as PairsState;
      render();
    },
    updatePrivate(data) {
      board = data as PairsPrivate;
      renderBoard();
      render();
    },
    destroy() {
      bar.destroy();
    },
  };
}
