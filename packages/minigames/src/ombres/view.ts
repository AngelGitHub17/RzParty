import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, mount3D, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import type { OmbresScene } from "./scene3d.ts";
import { SHADOW_ASK_MS, SHADOW_POINTS, SHADOW_REVEAL_MS, SHADOW_ROUNDS, SHADOW_THINGS, type OmbresState } from "./types.ts";

/** « Ombres chinoises » : une ombre sur le mur, quatre propositions. */
export function ombresView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: OmbresState | null = null;
  let picked = -1;
  let pickedRound = 0;
  const bar = timeBar(ctx.serverNow);
  const title = h("p", { class: "omb__title", attrs: { "aria-live": "polite" } });
  // Le mur 2D (remplacé par la 3D quand elle est disponible).
  const shadow = h("span", { class: "omb__shadow" });
  const wall = h("div", { class: "omb__wall" }, shadow);
  const box = h("div", { class: "mg3d-box omb__box" }, wall);
  let scene: OmbresScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ OmbresScene }, host) => {
    if (gone) return false;
    scene = new OmbresScene(host);
    if (state) scene.update(state);
    return true;
  });
  const choices = h("div", { class: "omb__choices" });
  const who = h("ul", { class: "omb__who" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg omb omb--${ctx.layout}` }, bar.el, title, box, choices, who, ctx.layout === "pad" ? null : lanes));

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.phaseEndsAt - (s.phase === "ask" ? SHADOW_ASK_MS : SHADOW_REVEAL_MS), s.phaseEndsAt);
    scene?.update(s);
    if (pickedRound !== s.round) {
      picked = -1;
      pickedRound = s.round;
    }
    const mine = ctx.me ? (s.correct.includes(ctx.me) ? "ok" : s.wrong.includes(ctx.me) ? "ko" : null) : null;
    title.textContent =
      s.phase === "done"
        ? "Terminé !"
        : s.phase === "reveal"
          ? `C'était ${s.answer !== null ? SHADOW_THINGS[s.choices[s.answer]!] : "…"} !`
          : mine === "ok"
            ? "Bien vu !"
            : mine === "ko"
              ? "Raté… attends l'ombre suivante"
              : `Ombre ${s.round}/${SHADOW_ROUNDS} · À qui est cette ombre ?`;
    shadow.textContent = s.shadow !== null ? SHADOW_THINGS[s.shadow]! : "";
    shadow.style.transform = `rotate(${s.tilt}deg) scaleX(${s.mirror ? -1 : 1})`;
    wall.classList.toggle("is-reveal", s.phase === "reveal");
    clear(choices);
    s.choices.forEach((thing, i) => {
      const btn = h(
        interactive ? "button" : "div",
        {
          class: `omb__choice${picked === i ? " is-picked" : ""}${s.answer === i ? " is-answer" : ""}${s.phase === "reveal" && s.answer !== i ? " is-dim" : ""}`,
          attrs: interactive ? { type: "button", "aria-label": `Proposition ${i + 1}` } : {},
          on:
            interactive && s.phase === "ask" && !mine
              ? {
                  pointerdown: (e: Event) => {
                    e.preventDefault();
                    picked = i;
                    ctx.send({ round: s.round, pick: i });
                    render();
                  },
                }
              : {},
        },
        h("span", { text: SHADOW_THINGS[thing]! }),
      );
      choices.append(btn);
    });
    clear(who);
    for (const id of [...s.correct, ...s.wrong]) {
      const p = ctx.players.find((x) => x.id === id);
      if (!p) continue;
      const rank = s.correct.indexOf(id);
      who.append(h("li", { class: rank >= 0 ? "is-ok" : "is-ko", style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(id, 24), h("span", { text: rank === 0 ? `+${SHADOW_POINTS.first}` : rank > 0 ? `+${SHADOW_POINTS.other}` : "✗" })));
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, max: SHADOW_ROUNDS * SHADOW_POINTS.first, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as OmbresState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      bar.destroy();
    },
  };
}
