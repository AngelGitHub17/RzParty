import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, mount3D, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import type { GlacesScene } from "./scene3d.ts";
import { FLAVORS, ICE_BUILD_MS, ICE_POINTS, ICE_REVEAL_MS, ICE_ROUNDS, iceShowMs, type GlacesState } from "./types.ts";

/** Un cornet en 2D (boules empilées de bas en haut). */
function cone2d(scoops: (number | null)[]): HTMLElement {
  return h(
    "div",
    { class: "ice__cone" },
    ...[...scoops].reverse().map((f) => h("span", { class: `ice__scoop${f === null ? " is-empty" : ""}`, style: f === null ? {} : { background: FLAVORS[f]!.hex } })),
    h("span", { class: "ice__wafer" }),
  );
}

/** « Cornet glacé » : mémoriser la commande, puis la refaire boule par boule. */
export function glacesView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: GlacesState | null = null;
  let mine: number[] = [];
  let mineRound = 0;
  const bar = timeBar(ctx.serverNow);
  const title = h("p", { class: "ice__title", attrs: { "aria-live": "polite" } });
  const flat = h("div", { class: "ice__flat" });
  const box = h("div", { class: "mg3d-box ice__box" }, flat);
  let scene: GlacesScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ GlacesScene }, host) => {
    if (gone) return false;
    scene = new GlacesScene(host);
    if (state) scene.update(state, mine, interactive);
    return true;
  });
  const pad = h("div", { class: "ice__pad" });
  const who = h("ul", { class: "ice__who" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg ice ice--${ctx.layout}` }, bar.el, title, box, interactive ? pad : null, who, ctx.layout === "pad" ? null : lanes));

  function add(f: number): void {
    const s = state;
    if (!s || s.phase !== "build" || mine.length >= s.size || done()) return;
    mine.push(f);
    if (mine.length === s.size) ctx.send({ round: s.round, scoops: [...mine] });
    render();
  }
  function done(): boolean {
    return !!state && !!ctx.me && (state.correct.includes(ctx.me) || state.wrong.includes(ctx.me));
  }

  function render(): void {
    if (!state) return;
    const s = state;
    if (mineRound !== s.round) {
      mine = [];
      mineRound = s.round;
    }
    const total = s.phase === "show" ? iceShowMs(s.size) : s.phase === "build" ? ICE_BUILD_MS : ICE_REVEAL_MS;
    bar.set(s.phaseEndsAt - total, s.phaseEndsAt);
    const res = ctx.me ? (s.correct.includes(ctx.me) ? "ok" : s.wrong.includes(ctx.me) ? "ko" : null) : null;
    title.textContent =
      s.phase === "done"
        ? "Terminé !"
        : s.phase === "show"
          ? `Commande ${s.round}/${ICE_ROUNDS} · Mémorise les ${s.size} boules (de bas en haut) !`
          : s.phase === "reveal"
            ? "Voici la commande !"
            : res === "ok"
              ? "Bon cornet ! 🍦"
              : res === "ko"
                ? "Oups, ce n'était pas ça…"
                : `À toi : ${mine.length}/${s.size} boules`;
    scene?.update(s, mine, interactive);
    clear(flat);
    if (s.order) flat.append(cone2d(s.order));
    else if (interactive) flat.append(cone2d(Array.from({ length: s.size }, (_, i) => mine[i] ?? null)));
    else flat.append(h("div", { class: "ice__secret", text: "🍦 ?" }));
    if (interactive) {
      clear(pad);
      const can = s.phase === "build" && !res && mine.length < s.size;
      pad.append(
        ...FLAVORS.map((f, i) =>
          h("button", {
            class: "ice__flavor",
            attrs: { type: "button", "aria-label": f.label, ...(can ? {} : { disabled: "" }) },
            style: { "--flavor": f.hex },
            on: { pointerdown: (e: Event) => (e.preventDefault(), add(i)) },
          }, h("span", { class: "ice__ball" }), h("small", { text: f.label })),
        ),
        h("button", { class: "ice__undo", attrs: { type: "button", ...(can && mine.length ? {} : { disabled: "" }) }, text: "↩ Enlever", on: { click: () => (mine.pop(), render()) } }),
      );
    }
    clear(who);
    for (const id of [...s.correct, ...s.wrong]) {
      const p = ctx.players.find((x) => x.id === id);
      if (!p) continue;
      const rank = s.correct.indexOf(id);
      who.append(h("li", { class: rank >= 0 ? "is-ok" : "is-ko", style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(id, 24), h("span", { text: rank >= 0 ? `+${ICE_POINTS[rank] ?? 1}` : "✗" })));
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, max: ICE_ROUNDS * 3, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as GlacesState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      bar.destroy();
    },
  };
}
