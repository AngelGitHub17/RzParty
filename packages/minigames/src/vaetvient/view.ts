import "./style.css";
import { PLAYER_COLORS, randomAvatar, createRng } from "@rzparty/shared";
import { clear, h, keypad, mount3D, scoreLanes, timeBar } from "../kit.ts";
import type { VaetvientScene } from "./scene3d.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { VV_ANSWER_MS, VV_INTRO_MS, VV_REVEAL_MS, VV_ROUNDS, type VVState } from "./types.ts";

/** « Va-et-vient » : une maison, des passants qui entrent et sortent, un pavé pour répondre. */
export function vaetvientView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: VVState | null = null;
  let typed = "";
  let shownMove = -1;
  const rng = createRng(7);
  const bar = timeBar(ctx.serverNow);
  const title = h("p", { class: "vv__title", attrs: { "aria-live": "polite" } });
  const scene = h("div", { class: "vv__scene" }, h("div", { class: "vv__house" }, h("div", { class: "vv__roof" }), h("div", { class: "vv__door" })));
  const answer = h("p", { class: "vv__answer" });
  const answers = h("ul", { class: "vv__answers" });
  const lanes = h("ol", {});
  const pad = interactive
    ? keypad({
        keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"],
        onKey(key) {
          if (!state || state.phase !== "answer" || (ctx.me && state.answered.includes(ctx.me))) return;
          if (key === "back") typed = typed.slice(0, -1);
          else if (key === "ok") return void (typed && ctx.send({ round: state.round, answer: Number(typed) }));
          else if (typed.length < 2) typed += key;
          answer.textContent = typed || " ";
        },
      })
    : null;
  const work = h("div", { class: "vv__work" }, answer, pad?.el);
  // En 3D quand c'est possible (la maison 2D reste là sinon).
  const box = h("div", { class: "mg3d-box vv__box" }, scene);
  let scene3d: VaetvientScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ VaetvientScene }, host) => {
    if (gone) return false;
    scene3d = new VaetvientScene(host);
    return true;
  });
  root.append(h("div", { class: `mg vv vv--${ctx.layout}` }, bar.el, title, box, interactive ? work : null, answers, ctx.layout === "pad" ? null : lanes));

  function walk(dir: "in" | "out", count: number): void {
    if (scene3d) return scene3d.move(dir, count);
    for (let i = 0; i < count; i++) {
      const walker = h("span", { class: `vv__walker vv__walker--${dir}`, style: { "animation-delay": `${i * 120}ms` } }, ctx.drawAvatar(randomAvatar(rng), 46));
      scene.append(walker);
      setTimeout(() => walker.remove(), 1400 + i * 120);
    }
  }

  let lastRound = 0;
  function render(): void {
    if (!state) return;
    const s = state;
    if (s.round !== lastRound) {
      lastRound = s.round;
      typed = "";
      answer.textContent = " ";
    }
    if (s.move && s.move.id !== shownMove) {
      shownMove = s.move.id;
      walk(s.move.dir, s.move.count);
    }
    if (s.phase === "intro" || s.phase === "answer" || s.phase === "reveal") {
      const total = s.phase === "intro" ? VV_INTRO_MS : s.phase === "answer" ? VV_ANSWER_MS : VV_REVEAL_MS;
      bar.set(s.phaseEndsAt - total, s.phaseEndsAt);
    }
    const iAnswered = ctx.me ? s.answered.includes(ctx.me) : false;
    title.textContent =
      s.phase === "intro"
        ? `Manche ${s.round}/${VV_ROUNDS} · Au départ, ${s.start} personne${s.start > 1 ? "s" : ""} dans la maison`
        : s.phase === "moves"
          ? "Compte bien…"
          : s.phase === "answer"
            ? iAnswered
              ? "Réponse envoyée !"
              : "Combien sont dans la maison ?"
            : s.phase === "reveal"
              ? `Il y en avait ${s.inside} !`
              : "Terminé !";
    work.hidden = s.phase !== "answer" || iAnswered;
    clear(answers);
    if (s.phase === "answer" || s.phase === "reveal") {
      for (const p of ctx.players) {
        const a = s.answers?.[p.id];
        answers.append(
          h(
            "li",
            { class: `eye__chip${a !== undefined && a === s.inside ? " is-exact" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
            ctx.avatar(p.id, 26),
            h("span", { text: a !== undefined ? String(a) : s.answered.includes(p.id) ? "✓" : "…" }),
          ),
        );
      }
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, max: VV_ROUNDS * 3, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as VVState;
      render();
    },
    destroy() {
      gone = true;
      scene3d?.destroy();
      bar.destroy();
      pad?.destroy();
    },
  };
}
