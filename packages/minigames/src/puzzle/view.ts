import "./style.css";
import { h, scoreLanes, svg, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { BANDS, PIECE_COLORS, PIECE_SHAPES, PUZZLE_MS, type Band, type PuzzlePrivate, type PuzzleState } from "./types.ts";

const W = 90;
const BAND_H = 60;

/** Une forme dessinée autour de (cx, cy). */
function shapePath(shape: number, cx: number, cy: number, color: string): string {
  const r = 22;
  switch (PIECE_SHAPES[shape]) {
    case "rond":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
    case "carre":
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="5" fill="${color}"/>`;
    case "triangle":
      return `<path d="M${cx} ${cy - r} L${cx + r} ${cy + r} L${cx - r} ${cy + r}Z" fill="${color}"/>`;
    default: {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r * 1.05;
        return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
      });
      return `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
    }
  }
}

/** Une moitié d'image : la forme de chaque bande est centrée sur le bord coupé. */
function half(bands: Band[], side: "left" | "right"): SVGSVGElement {
  const cx = side === "left" ? W : 0;
  const body = bands
    .map((b, i) => `<rect y="${i * BAND_H}" width="${W}" height="${BAND_H}" fill="${i % 2 ? "#eef7ff" : "#ffffff"}"/>${shapePath(b.shape, cx, i * BAND_H + BAND_H / 2, PIECE_COLORS[b.color]!)}`)
    .join("");
  return svg(`<svg class="pz__half pz__half--${side}" viewBox="0 0 ${W} ${BAND_H * BANDS}" aria-hidden="true">${body}</svg>`);
}

/** « Puzzle express » : retrouver la moitié droite qui complète l'image. */
export function puzzleView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: PuzzleState | null = null;
  let card: PuzzlePrivate["card"] = null;
  const bar = timeBar(ctx.serverNow);
  const mine = h("p", { class: "mole__mine" });
  const board = h("div", { class: "pz__board" });
  const lanes = h("ol", {});
  const help = h("p", { class: "pz__help", text: "Chacun résout ses puzzles sur son écran." });
  root.append(h("div", { class: `mg pz pz--${ctx.layout}` }, bar.el, interactive ? mine : null, interactive ? board : help, ctx.layout === "pad" ? null : lanes));

  const KEYS: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3 };
  const onKey = (e: KeyboardEvent) => {
    const i = KEYS[e.key];
    if (i === undefined || !interactive) return;
    e.preventDefault();
    choose(i);
  };
  window.addEventListener("keydown", onKey);

  function locked(): boolean {
    return Boolean(state && ctx.me && (state.lockedUntil[ctx.me] ?? 0) > ctx.serverNow());
  }

  function choose(i: number): void {
    if (!card || !state || state.finished || locked()) return;
    ctx.send({ index: card.index, choice: i });
  }

  function drawCard(last: PuzzlePrivate["last"]): void {
    board.replaceChildren();
    if (!card) return;
    const c = card;
    board.append(
      h("div", { class: "pz__left" }, half(c.left, "left"), h("span", { class: "pz__cut", attrs: { "aria-hidden": "true" } })),
      h(
        "div",
        { class: "pz__choices" },
        ...c.choices.map((bands, i) =>
          h("button", { class: "pz__choice", attrs: { type: "button", "aria-label": `Moitié ${i + 1}` }, on: { pointerdown: (e) => (e.preventDefault(), choose(i)) } }, half(bands, "right"), h("span", { class: "pz__key", text: String(i + 1) })),
        ),
      ),
    );
    board.classList.remove("is-ok", "is-ko");
    if (last) {
      void board.offsetWidth;
      board.classList.add(last === "ok" ? "is-ok" : "is-ko");
    }
  }

  function render(): void {
    const s = state;
    if (!s) return;
    bar.set(s.endsAt - PUZZLE_MS, s.endsAt);
    board.classList.toggle("is-locked", locked());
    if (ctx.me) mine.textContent = `${s.solved[ctx.me] ?? 0} puzzle${(s.solved[ctx.me] ?? 0) > 1 ? "s" : ""}${s.finished ? " · Terminé !" : locked() ? " · Oups, bloqué…" : ""}`;
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.solved[id] ?? 0, me: ctx.me, avatar: ctx.avatar });
  }

  const unlockTimer = setInterval(render, 250);

  return {
    update(next) {
      state = next as PuzzleState;
      render();
    },
    updatePrivate(data) {
      const d = data as PuzzlePrivate;
      card = d.card;
      drawCard(d.last);
      render();
    },
    destroy() {
      bar.destroy();
      clearInterval(unlockTimer);
      window.removeEventListener("keydown", onKey);
    },
  };
}
