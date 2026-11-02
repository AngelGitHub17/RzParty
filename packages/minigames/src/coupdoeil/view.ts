import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, keypad, scoreLanes, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { EYE_ANSWER_MS, EYE_REVEAL_MS, EYE_ROUNDS, EYE_SHOW_MS, SHAPE_LABELS, type EyeState, type Shape } from "./types.ts";

const SHAPE_COLORS = ["#F0483E", "#2F7BEF", "#2DB866", "#F2B705", "#9257E8", "#FF8A1F"];
const NS = "http://www.w3.org/2000/svg";

function shapeEl(s: Shape): SVGElement {
  const r = 3.2 * s.size;
  let el: SVGElement;
  if (s.kind === "rond") {
    el = document.createElementNS(NS, "circle");
    el.setAttribute("r", String(r));
  } else if (s.kind === "carre") {
    el = document.createElementNS(NS, "rect");
    el.setAttribute("x", String(-r));
    el.setAttribute("y", String(-r));
    el.setAttribute("width", String(2 * r));
    el.setAttribute("height", String(2 * r));
    el.setAttribute("rx", "0.8");
  } else {
    el = document.createElementNS(NS, "polygon");
    const pts: string[] = [];
    const n = s.kind === "triangle" ? 3 : 10;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const rr = s.kind === "etoile" && i % 2 ? r * 0.45 : r * (s.kind === "triangle" ? 1.2 : 1.15);
      pts.push(`${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`);
    }
    el.setAttribute("points", pts.join(" "));
  }
  el.setAttribute("fill", SHAPE_COLORS[s.color % SHAPE_COLORS.length]!);
  el.setAttribute("transform", `translate(${s.x} ${s.y})`);
  return el;
}

/** « Coup d'œil » : mémoriser un champ de formes, puis compter celles demandées. */
export function coupdoeilView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: EyeState | null = null;
  let typed = "";
  const bar = timeBar(ctx.serverNow);
  const title = h("p", { class: "eye__title", attrs: { "aria-live": "polite" } });
  const field = document.createElementNS(NS, "svg");
  field.setAttribute("viewBox", "0 0 100 100");
  field.setAttribute("class", "eye__field");
  const question = h("p", { class: "eye__question" });
  const answer = h("p", { class: "eye__answer" });
  const answers = h("ul", { class: "eye__answers" });
  const lanes = h("ol", {});
  const pad = interactive
    ? keypad({
        keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"],
        onKey(key) {
          if (!state || state.phase !== "answer" || (ctx.me && state.answered.includes(ctx.me))) return;
          if (key === "back") typed = typed.slice(0, -1);
          else if (key === "ok") {
            if (typed) ctx.send({ round: state.round, answer: Number(typed) });
            return;
          } else if (typed.length < 2) typed += key;
          answer.textContent = typed || " ";
        },
      })
    : null;
  const work = h("div", { class: "eye__work" }, question, answer, pad?.el);

  root.append(h("div", { class: `mg eye eye--${ctx.layout}` }, bar.el, title, field, interactive ? work : null, answers, ctx.layout === "pad" ? null : lanes));

  let lastRound = 0;
  function render(): void {
    if (!state) return;
    const s = state;
    if (s.round !== lastRound) {
      lastRound = s.round;
      typed = "";
      answer.textContent = " ";
    }
    const total = s.phase === "show" ? EYE_SHOW_MS : s.phase === "answer" ? EYE_ANSWER_MS : EYE_REVEAL_MS;
    bar.set(s.phaseEndsAt - total, s.phaseEndsAt);
    const ask = SHAPE_LABELS[s.ask];
    title.textContent =
      s.phase === "show"
        ? `Manche ${s.round}/${EYE_ROUNDS} · Regarde bien !`
        : s.phase === "answer"
          ? `Combien de ${ask.name} ${ask.symbol} ?`
          : s.phase === "reveal"
            ? `Il y avait ${s.count} ${ask.name} ${ask.symbol}`
            : "Terminé !";
    // Les formes : visibles pendant « show » et à la révélation (la forme demandée en évidence).
    while (field.firstChild) field.removeChild(field.firstChild);
    field.classList.toggle("is-hidden", !s.shapes);
    for (const shape of s.shapes ?? []) {
      const el = shapeEl(shape);
      if (s.phase === "reveal" && shape.kind !== s.ask) el.setAttribute("opacity", "0.15");
      field.append(el);
    }
    const iAnswered = ctx.me ? s.answered.includes(ctx.me) : false;
    question.textContent = s.phase === "answer" ? (iAnswered ? "Réponse envoyée !" : `Combien de ${ask.name} ${ask.symbol} ?`) : s.phase === "show" ? "Mémorise…" : "";
    work.hidden = s.phase !== "answer";
    clear(answers);
    if (s.phase === "answer" || s.phase === "reveal") {
      for (const p of ctx.players) {
        const a = s.answers?.[p.id];
        const done = s.answered.includes(p.id);
        answers.append(
          h(
            "li",
            { class: `eye__chip${a !== undefined && s.count !== null && a === s.count ? " is-exact" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
            ctx.avatar(p.id, 26),
            h("span", { text: a !== undefined ? String(a) : done ? "✓" : "…" }),
          ),
        );
      }
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, me: ctx.me, avatar: ctx.avatar, max: EYE_ROUNDS * 3 });
  }

  return {
    update(next) {
      state = next as EyeState;
      render();
    },
    destroy() {
      bar.destroy();
      pad?.destroy();
    },
  };
}
