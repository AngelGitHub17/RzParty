import "./style.css";
import { everyFrame, h, mount3D, scoreLanes, timeBar } from "../kit.ts";
import type { PerlesScene } from "./scene3d.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { CLOSING_MS, OYSTERS, PERLES_MS, type PerlesState } from "./types.ts";

/** « Chasse aux perles » : six huîtres qui s'ouvrent au fond de la mer. */
export function perlesView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: PerlesState | null = null;
  /** Instant local d'apparition de chaque ouverture (pour mesurer le temps de l'appui). */
  const seenAt = new Map<number, number>();
  const bar = timeBar(ctx.serverNow);
  const mine = h("p", { class: "mole__mine" });
  const lanes = h("ol", {});
  const shells = Array.from({ length: OYSTERS }, (_, i) =>
    h(
      interactive ? "button" : "div",
      { class: "pearl__oyster", attrs: interactive ? { type: "button", "aria-label": `Huître ${i + 1}` } : {}, on: interactive ? { pointerdown: (e: Event) => (e.preventDefault(), grab(i)) } : {} },
      h("span", { class: "pearl__top", attrs: { "aria-hidden": "true" } }),
      h("span", { class: "pearl__treasure", attrs: { "aria-hidden": "true" } }),
      h("span", { class: "pearl__bottom", attrs: { "aria-hidden": "true" } }),
    ),
  );
  const sea = h("div", { class: "pearl__sea" }, ...shells);
  // En 3D quand c'est possible (la mer 2D reste là sinon).
  const box = h("div", { class: "mg3d-box pearl__box" }, sea);
  let scene: PerlesScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ PerlesScene }, host) => {
    if (gone) return false;
    scene = new PerlesScene(host, interactive, (i) => grab(i));
    return true;
  });
  root.append(h("div", { class: `mg pearl pearl--${ctx.layout}` }, bar.el, interactive ? mine : null, h("div", { class: "mole__stage" }, box, ctx.layout === "pad" ? null : lanes)));
  const KEYS: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5 };
  const onKey = (e: KeyboardEvent) => {
    const i = KEYS[e.key];
    if (i === undefined || !interactive) return;
    e.preventDefault();
    grab(i);
  };
  window.addEventListener("keydown", onKey);

  function grab(i: number): void {
    const s = state;
    if (!s || s.finished || !ctx.me || (s.pinched[ctx.me] ?? 0) > ctx.serverNow()) return;
    const o = s.openings.find((x) => x.oyster === i && x.until > ctx.serverNow() - 100);
    if (!o || s.taken[ctx.me]?.includes(o.id)) return;
    ctx.send({ opening: o.id, dt: Math.round(performance.now() - (seenAt.get(o.id) ?? performance.now())) });
    shells[i]!.classList.add("is-grabbed");
  }

  const stop = everyFrame(() => {
    const s = state;
    if (!s) return;
    const now = ctx.serverNow();
    const taken = new Set(ctx.me ? s.taken[ctx.me] : []);
    shells.forEach((shell, i) => {
      const o = s.openings.find((x) => x.oyster === i && x.from <= now && x.until > now);
      shell.classList.toggle("is-open", Boolean(o));
      shell.classList.toggle("is-closing", Boolean(o && o.until - now < CLOSING_MS));
      shell.dataset.treasure = o ? o.treasure : "";
      shell.classList.toggle("is-grabbed", Boolean(o && taken.has(o.id)));
    });
    if (ctx.me) sea.classList.toggle("is-pinched", (s.pinched[ctx.me] ?? 0) > now);
    scene?.update(s, taken, now, Boolean(ctx.me && (s.pinched[ctx.me] ?? 0) > now));
  });

  function render(): void {
    const s = state;
    if (!s) return;
    bar.set(s.endsAt - PERLES_MS, s.endsAt);
    for (const o of s.openings) if (!seenAt.has(o.id)) seenAt.set(o.id, performance.now() - Math.max(0, ctx.serverNow() - o.from));
    if (ctx.me) {
      const pinched = (s.pinched[ctx.me] ?? 0) > ctx.serverNow();
      mine.textContent = `${s.scores[ctx.me] ?? 0} point${(s.scores[ctx.me] ?? 0) > 1 ? "s" : ""}${s.finished ? " · Terminé !" : pinched ? " · Aïe, pincé !" : ""}`;
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as PerlesState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      bar.destroy();
      stop();
      window.removeEventListener("keydown", onKey);
    },
  };
}
