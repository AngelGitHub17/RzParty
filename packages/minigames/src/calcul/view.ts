import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, keypad, timeBar, reportScores } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { CALCUL_DURATION_MS, type CalculPrivate, type CalculState } from "./types.ts";

/**
 * « Calcul express » : chacun sa suite de calculs, au pavé numérique.
 * L'écran commun montre la course des scores.
 */
export function calculView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: CalculState | null = null;
  let current: CalculPrivate | null = null;
  let typed = "";

  const bar = timeBar(ctx.serverNow);
  const race = h("ol", { class: "calc__race" });
  const question = h("p", { class: "calc__question", attrs: { "aria-live": "polite" } });
  const answer = h("p", { class: "calc__answer" });
  const verdict = h("p", { class: "calc__verdict", attrs: { "aria-live": "polite" } });
  const myScore = h("p", { class: "calc__mine" });

  const pad = interactive
    ? keypad({
        keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "0", "back", "ok"],
        onKey(key) {
          if (!current || state?.finished) return;
          if (key === "back") typed = typed.slice(0, -1);
          else if (key === "-") typed = typed.startsWith("-") ? typed.slice(1) : `-${typed}`;
          else if (key === "ok") return submit();
          else if (typed.replace("-", "").length < 4) typed += key;
          renderAnswer();
        },
      })
    : null;

  root.append(
    h(
      "div",
      { class: `mg calc calc--${ctx.layout}` },
      bar.el,
      interactive ? h("div", { class: "calc__work" }, myScore, question, answer, verdict, pad!.el) : null,
      ctx.layout === "pad" ? null : race,
    ),
  );

  function submit(): void {
    if (!current || typed === "" || typed === "-") return;
    ctx.send({ index: current.index, answer: Number(typed) });
    typed = "";
    renderAnswer();
  }

  function renderAnswer(): void {
    answer.textContent = typed || " ";
    answer.classList.toggle("is-empty", !typed);
  }

  function renderPrivate(): void {
    if (!current) return;
    question.textContent = `${current.question} =`;
    verdict.textContent = current.last === "juste" ? "Juste !" : current.last === "faux" ? "Raté, au suivant" : "";
    verdict.className = `calc__verdict${current.last ? ` is-${current.last}` : ""}`;
    // Relance l'animation du verdict à chaque réponse.
    void verdict.offsetWidth;
    verdict.classList.add("pop");
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - CALCUL_DURATION_MS, s.endsAt);
    reportScores(root, Object.fromEntries(Object.entries(s.progress).map(([id, p]) => [id, p.score])));
    if (ctx.me && s.progress[ctx.me]) myScore.textContent = `${s.progress[ctx.me]!.score} bonne${s.progress[ctx.me]!.score > 1 ? "s" : ""} réponse${s.progress[ctx.me]!.score > 1 ? "s" : ""}`;
    if (s.finished && interactive) {
      question.textContent = "Temps écoulé !";
      answer.textContent = " ";
      verdict.textContent = "";
    }
    if (ctx.layout === "pad") return;
    const best = Math.max(1, ...Object.values(s.progress).map((p) => p.score));
    const rows = [...ctx.players].sort((a, b) => (s.progress[b.id]?.score ?? 0) - (s.progress[a.id]?.score ?? 0));
    clear(race);
    for (const p of rows) {
      const score = s.progress[p.id]?.score ?? 0;
      race.append(
        h(
          "li",
          { class: `calc__lane${p.id === ctx.me ? " is-me" : ""}` },
          ctx.avatar(p.id, 34),
          h("span", { class: "calc__name", text: p.name }),
          h("span", { class: "calc__track" }, h("span", { class: "calc__fill", style: { width: `${(score / best) * 100}%`, background: PLAYER_COLORS[p.color]?.hex } })),
          h("strong", { class: "calc__score", text: String(score) }),
        ),
      );
    }
  }

  renderAnswer();
  return {
    update(next) {
      state = next as CalculState;
      render();
    },
    updatePrivate(data) {
      current = data as CalculPrivate;
      renderPrivate();
    },
    destroy() {
      bar.destroy();
      pad?.destroy();
    },
  };
}
