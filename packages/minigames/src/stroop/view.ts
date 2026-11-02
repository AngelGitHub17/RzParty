import "./style.css";
import { everyFrame, h, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { STROOP_COLORS, STROOP_DURATION_MS, type StroopColor, type StroopPrivate, type StroopState } from "./types.ts";

const COLOR = Object.fromEntries(STROOP_COLORS.map((c) => [c.id, c]));

/** « Couleurs piégées » : toucher la couleur de l'encre, pas celle du mot. */
export function stroopView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: StroopState | null = null;
  let current: StroopPrivate | null = null;
  const bar = timeBar(ctx.serverNow);
  const word = h("p", { class: "stroop__word", attrs: { "aria-live": "polite" } });
  const verdict = h("p", { class: "stroop__verdict" });
  const buttons = h("div", { class: "stroop__buttons" });
  const lanes = h("ol", {});
  const mine = h("p", { class: "stroop__mine" });

  root.append(
    h(
      "div",
      { class: `mg stroop stroop--${ctx.layout}` },
      bar.el,
      interactive ? h("div", { class: "stroop__work" }, mine, word, verdict, buttons) : null,
      ctx.layout === "pad" ? null : lanes,
    ),
  );

  const answer = (c: StroopColor) => {
    if (!current || state?.finished || ctx.serverNow() < current.lockedUntil) return;
    ctx.send({ index: current.index, answer: c });
  };
  const onKey = (e: KeyboardEvent) => {
    if (!current || !interactive) return;
    const i = Number(e.key) - 1;
    const c = current.question.choices[i];
    if (c) {
      e.preventDefault();
      answer(c);
    }
  };
  window.addEventListener("keydown", onKey);
  // Affiche le blocage après une erreur.
  const stop = everyFrame(() => {
    if (!current) return;
    buttons.classList.toggle("is-locked", ctx.serverNow() < current.lockedUntil);
  });

  function renderPrivate(): void {
    if (!current) return;
    const q = current.question;
    word.textContent = COLOR[q.word]!.label;
    word.style.color = COLOR[q.ink]!.hex;
    verdict.textContent = current.last === "juste" ? "Juste !" : current.last === "faux" ? "Raté ! C'était la couleur de l'encre…" : "Touche la couleur de l'ENCRE";
    verdict.className = `stroop__verdict${current.last ? ` is-${current.last}` : ""}`;
    buttons.replaceChildren(
      ...q.choices.map((c, i) =>
        h("button", {
          class: "stroop__btn",
          attrs: { type: "button", title: `Touche ${i + 1}` },
          text: COLOR[c]!.label.toLowerCase(),
          style: { background: COLOR[c]!.hex },
          on: { pointerdown: (e) => (e.preventDefault(), answer(c)) },
        }),
      ),
    );
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - STROOP_DURATION_MS, s.endsAt);
    if (ctx.me && s.progress[ctx.me]) mine.textContent = `${s.progress[ctx.me]!.score} juste${s.progress[ctx.me]!.score > 1 ? "s" : ""}`;
    if (s.finished && interactive) {
      word.textContent = "Temps écoulé !";
      word.style.color = "";
      buttons.replaceChildren();
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.progress[id]?.score ?? 0, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as StroopState;
      render();
    },
    updatePrivate(data) {
      current = data as StroopPrivate;
      if (!state?.finished) renderPrivate();
    },
    destroy() {
      bar.destroy();
      stop();
      window.removeEventListener("keydown", onKey);
    },
  };
}
