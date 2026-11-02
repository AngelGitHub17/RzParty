import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { FACE_FIND_MS, FACE_REVEAL_MS, FACE_ROUNDS, FACE_SHOW_MS, type FaceState } from "./types.ts";

/** « Où est-il ? » : mémoriser un personnage puis le retrouver parmi 12 sosies. */
export function visageView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: FaceState | null = null;
  let picked = -1;
  let builtRound = -1;
  const bar = timeBar(ctx.serverNow);
  const title = h("p", { class: "face__title", attrs: { "aria-live": "polite" } });
  const target = h("div", { class: "face__target" });
  const crowd = h("div", { class: "face__crowd" });
  const who = h("ul", { class: "face__who" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg face face--${ctx.layout}` }, bar.el, title, target, crowd, who, ctx.layout === "pad" ? null : lanes));

  function render(): void {
    if (!state) return;
    const s = state;
    const total = s.phase === "show" ? FACE_SHOW_MS : s.phase === "find" ? FACE_FIND_MS : FACE_REVEAL_MS;
    bar.set(s.phaseEndsAt - total, s.phaseEndsAt);
    const mine = ctx.me ? (s.correct.includes(ctx.me) ? "juste" : s.wrong.includes(ctx.me) ? "faux" : null) : null;
    title.textContent =
      s.phase === "show"
        ? `Manche ${s.round}/${FACE_ROUNDS} · Mémorise ce personnage !`
        : s.phase === "find"
          ? mine === "juste"
            ? "Trouvé !"
            : mine === "faux"
              ? "Raté… attends la manche suivante"
              : "Où est-il ?"
          : s.phase === "reveal"
            ? "Le voici !"
            : "Terminé !";
    clear(target);
    target.hidden = !s.target || s.phase === "reveal";
    if (s.target && s.phase === "show") target.append(ctx.drawAvatar(s.target, ctx.layout === "pad" ? 140 : 180));
    if (builtRound !== s.round || s.phase !== "find") {
      clear(crowd);
      picked = builtRound === s.round ? picked : -1;
    }
    crowd.hidden = !s.crowd;
    if (s.crowd && (builtRound !== s.round || !crowd.childElementCount)) {
      builtRound = s.round;
      s.crowd.forEach((a, i) => {
        const cell = h(
          interactive ? "button" : "div",
          {
            class: "face__cell",
            attrs: interactive ? { type: "button", "aria-label": `Personnage ${i + 1}` } : {},
            on: interactive
              ? {
                  pointerdown: (e: Event) => {
                    e.preventDefault();
                    if (state?.phase !== "find" || picked >= 0) return;
                    picked = i;
                    ctx.send({ round: state.round, pick: i });
                    render();
                  },
                }
              : {},
          },
          ctx.drawAvatar(a, ctx.layout === "pad" ? 60 : 78),
        );
        crowd.append(cell);
      });
    }
    Array.from(crowd.children).forEach((el, i) => {
      el.classList.toggle("is-picked", i === picked);
      el.classList.toggle("is-answer", s.answer === i);
      el.classList.toggle("is-dim", s.phase === "reveal" && s.answer !== i);
    });
    clear(who);
    for (const id of [...s.correct, ...s.wrong]) {
      const p = ctx.players.find((x) => x.id === id);
      if (!p) continue;
      const rank = s.correct.indexOf(id);
      who.append(
        h(
          "li",
          { class: rank >= 0 ? "is-ok" : "is-ko", style: { "--player": PLAYER_COLORS[p.color]?.hex } },
          ctx.avatar(id, 24),
          h("span", { text: rank >= 0 ? `+${[3, 2][rank] ?? 1}` : "✗" }),
        ),
      );
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, max: FACE_ROUNDS * 3, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as FaceState;
      render();
    },
    destroy() {
      bar.destroy();
    },
  };
}
