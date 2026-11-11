import "../timing.css";
import "./style.css";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { celebrate, h, mount3D, scoreLanes } from "../kit.ts";
import { castPlayers } from "../three/players.ts";
import type { EscargotsScene } from "./scene3d.ts";
import { SNAIL_GOAL, SNAIL_MAX_RATE, type EscargotsState } from "./types.ts";

/** « Course d'escargots » : je tapote à mon rythme, les escargots avancent vers la salade. */
export function escargotsView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: EscargotsState | null = null;
  let pending = 0;
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  const title = h("p", { class: "tm__title", attrs: { "aria-live": "polite" } });
  const rate = h("div", { class: "esc__rate" }, h("span", { class: "esc__rate-fill" }));
  const rateFill = rate.firstElementChild as HTMLElement;
  const button = h("button", { class: "tm__btn esc__btn", attrs: { type: "button" }, text: "TAPOTE !", on: { pointerdown: (e) => (e.preventDefault(), tap()) } });
  const lanes = h("ol", {});
  const box = h("div", { class: "mg3d-box esc__box" });
  let scene: EscargotsScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ EscargotsScene }, host) => {
    if (gone) return false;
    scene = new EscargotsScene(host, castPlayers(ctx), interactive ? ctx.me : null);
    if (state) scene.update(state, ctx.serverNow());
    return true;
  });
  // Sans 3D : des couloirs simples.
  const track = h("div", { class: "esc__track" });
  box.append(track);
  root.append(h("div", { class: `mg tm esc esc--${ctx.layout}` }, title, h("div", { class: "tm__stage" }, box), interactive ? rate : null, interactive ? button : null, ctx.layout === "pad" ? null : lanes));

  /** Mesure locale du rythme (pour la jauge) : appuis de la dernière seconde. */
  const taps: number[] = [];
  function tap(): void {
    if (!state || state.phase !== "run" || !ctx.me || ctx.me in state.finished) return;
    if (ctx.serverNow() < (state.tiredUntil[ctx.me] ?? 0)) return;
    pending++;
    const now = performance.now();
    taps.push(now);
    button.classList.remove("is-tap");
    void button.offsetWidth;
    button.classList.add("is-tap");
  }
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter") && interactive && !e.repeat) {
      e.preventDefault();
      tap();
    }
  };
  if (interactive) {
    window.addEventListener("keydown", onKey);
    flushTimer = setInterval(() => {
      if (pending > 0) {
        const n = Math.min(6, pending);
        pending -= n;
        ctx.send({ taps: n });
      }
      const now = performance.now();
      while (taps.length && taps[0]! < now - 1000) taps.shift();
      const r = taps.length / SNAIL_MAX_RATE;
      rateFill.style.width = `${Math.min(100, r * 100)}%`;
      rate.classList.toggle("is-danger", r > 0.85);
    }, 120);
  }

  function render(): void {
    if (!state) return;
    const s = state;
    const tired = ctx.me ? ctx.serverNow() < (s.tiredUntil[ctx.me] ?? 0) : false;
    title.textContent =
      s.phase === "ready"
        ? "À vos marques… Tapote à bon rythme, pas trop vite !"
        : s.phase === "run"
          ? tired
            ? "💦 Essoufflé ! Il reprend son souffle…"
            : ctx.me && ctx.me in s.finished
              ? "Arrivé ! Miam, la salade 🥬"
              : "Tapote ! (pas plus de 8 par seconde)"
          : "Arrivée !";
    button.classList.toggle("is-tired", tired);
    scene?.update(s, ctx.serverNow());
    track.replaceChildren(
      ...ctx.players.map((p) =>
        h("div", { class: "esc__lane" }, ctx.avatar(p.id, 24), h("span", { class: "esc__bar", style: { width: `${(100 * (s.progress[p.id] ?? 0)) / SNAIL_GOAL}%` } }, h("b", { text: "🐌" })), h("span", { text: "🥬" })),
      ),
    );
    if (ctx.layout !== "pad")
      scoreLanes(lanes, ctx.players, {
        score: (id) => s.progress[id] ?? 0,
        max: SNAIL_GOAL,
        me: ctx.me,
        avatar: ctx.avatar,
        label: (id) => (id in s.finished ? `${(s.finished[id]! / 1000).toFixed(2).replace(".", ",")} s` : `${Math.round((100 * (s.progress[id] ?? 0)) / SNAIL_GOAL)} %`),
        done: (id) => id in s.finished,
      });
    if (s.phase === "result" && ctx.me && ctx.me in s.finished && !root.dataset.cheered) {
      root.dataset.cheered = "1";
      celebrate(button);
    }
  }

  return {
    update(next: unknown) {
      state = next as EscargotsState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      if (flushTimer) clearInterval(flushTimer);
      window.removeEventListener("keydown", onKey);
    },
  };
}
