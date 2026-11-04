import "./style.css";
import { everyFrame, h, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { BALLOONS_MS, BALLOON_COLORS, RISE_MS, type BallonsState } from "./types.ts";

/** « Ballons volants » : éclater les ballons de la couleur demandée. */
export function ballonsView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: BallonsState | null = null;
  const bar = timeBar(ctx.serverNow);
  const wanted = h("p", { class: "bal__wanted", attrs: { "aria-live": "polite" } });
  const mine = h("p", { class: "mole__mine" });
  const sky = h("div", { class: "bal__sky" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg bal bal--${ctx.layout}` }, bar.el, wanted, interactive ? mine : null, h("div", { class: "bal__stage" }, sky, ctx.layout === "pad" ? null : lanes)));
  const els = new Map<number, HTMLElement>();
  /** Ballons éclatés sur cet appareil avant la réponse du serveur. */
  const local = new Set<number>();

  function pop(id: number, el: HTMLElement): void {
    if (!state || state.finished || local.has(id)) return;
    local.add(id);
    el.classList.add("is-popped");
    ctx.send({ balloon: id });
  }

  const stop = everyFrame(() => {
    const s = state;
    if (!s) return;
    const now = ctx.serverNow();
    for (const [id, el] of els) {
      const b = s.balloons.find((x) => x.id === id);
      const p = b ? (now - b.born) / RISE_MS : 2;
      if (p > 1.05) {
        el.remove();
        els.delete(id);
        continue;
      }
      el.style.transform = `translate(-50%, ${(1 - p) * 100}%)`;
      el.style.setProperty("--sway", `${Math.sin((now - (b?.born ?? 0)) / 400 + id) * 10}px`);
    }
  });

  function render(): void {
    const s = state;
    if (!s) return;
    bar.set(s.endsAt - BALLOONS_MS, s.endsAt);
    const c = BALLOON_COLORS[s.target]!;
    wanted.replaceChildren("Éclate les ballons ", h("strong", { style: { "--c": c.hex }, text: c.name }), " !");
    wanted.classList.remove("is-new");
    if (ctx.serverNow() - s.targetSince < 600) {
      void wanted.offsetWidth;
      wanted.classList.add("is-new");
    }
    const mineSet = new Set(ctx.me ? s.popped[ctx.me] : []);
    for (const b of s.balloons) {
      if (els.has(b.id) || ctx.serverNow() - b.born > RISE_MS) continue;
      const color = b.color === -1 ? "#ffc83d" : BALLOON_COLORS[b.color]!.hex;
      const el = h(
        interactive ? "button" : "span",
        {
          class: `bal__balloon${b.color === -1 ? " is-gold" : ""}`,
          style: { left: `${b.x * 100}%`, "--c": color },
          attrs: interactive ? { type: "button", "aria-label": b.color === -1 ? "Ballon doré" : `Ballon ${BALLOON_COLORS[b.color]!.name}` } : {},
        },
        h("span", { class: "bal__string", attrs: { "aria-hidden": "true" } }),
      );
      if (interactive) el.addEventListener("pointerdown", (e) => (e.preventDefault(), pop(b.id, el)));
      sky.append(el);
      els.set(b.id, el);
    }
    for (const [id, el] of els) if (mineSet.has(id)) el.classList.add("is-popped");
    if (ctx.me) mine.textContent = `${s.scores[ctx.me] ?? 0} point${(s.scores[ctx.me] ?? 0) > 1 ? "s" : ""}${s.finished ? " · Terminé !" : ""}`;
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as BallonsState;
      render();
    },
    destroy() {
      bar.destroy();
      stop();
    },
  };
}
