import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, everyFrame, h, scoreLanes } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { CHRONO_ROUNDS, CHRONO_VISIBLE_MS, formatSeconds, type ChronoState } from "./types.ts";

/** « Chrono à l'aveugle » : un grand chrono qui s'efface, un gros bouton STOP. */
export function chronoView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: ChronoState | null = null;
  /** Instant local où le départ a été affiché. */
  let shownAt = 0;
  let shownRound = 0;
  let stoppedRound = 0;
  let myElapsed = 0;
  const title = h("p", { class: "chrono__title" });
  const target = h("p", { class: "chrono__target" });
  const hint = h("p", { class: "chrono__hint", attrs: { "aria-live": "polite" } });
  const clock = h("p", { class: "chrono__clock" });
  /** Barre qui montre le temps qui passe tant que le chrono est visible, puis s'efface. */
  const barFill = h("span", { class: "chrono__bar-fill" });
  const bar = h("div", { class: "chrono__bar" }, barFill, h("span", { class: "chrono__bar-goal" }));
  const stop = h("button", { class: "chrono__stop", attrs: { type: "button" }, text: "STOP", on: { pointerdown: (e) => (e.preventDefault(), press()) } });
  const results = h("ul", { class: "chrono__results" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg chrono chrono--${ctx.layout}` }, title, target, clock, bar, hint, interactive ? stop : null, results, ctx.layout === "pad" ? null : lanes));
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter") && interactive) {
      e.preventDefault();
      press();
    }
  };
  window.addEventListener("keydown", onKey);

  function press(): void {
    if (!state || state.phase !== "run" || stoppedRound === state.round) return;
    stoppedRound = state.round;
    myElapsed = performance.now() - shownAt;
    ctx.send({ round: state.round, elapsed: Math.round(myElapsed) });
    render();
  }

  const tick = everyFrame(() => {
    if (!state || state.phase !== "run") return;
    const elapsed = performance.now() - shownAt;
    const visible = elapsed < CHRONO_VISIBLE_MS;
    if (stoppedRound === state.round) {
      clock.textContent = "Arrêté !";
      hint.textContent = "Attends les autres…";
    } else if (visible) {
      clock.textContent = formatSeconds(elapsed);
      const left = Math.ceil((CHRONO_VISIBLE_MS - elapsed) / 1000);
      hint.textContent = `Regarde bien le rythme… le chrono disparaît dans ${left} s`;
    } else {
      clock.textContent = "?,?? s";
      hint.textContent = `Compte dans ta tête et appuie sur STOP à ${formatSeconds(state.target)} !`;
    }
    clock.classList.toggle("is-hidden", !visible);
    // La barre avance vers l'objectif, puis se voile quand le chrono disparaît.
    barFill.style.width = `${Math.min(100, (Math.min(elapsed, CHRONO_VISIBLE_MS) / state.target) * 100)}%`;
    bar.classList.toggle("is-hidden", !visible);
  });

  function render(): void {
    if (!state) return;
    const s = state;
    if (s.phase === "run" && shownRound !== s.round) {
      shownRound = s.round;
      // Recale le départ local sur l'heure du serveur (le message a pu arriver un peu en retard).
      shownAt = performance.now() - Math.max(0, ctx.serverNow() - s.startedAt);
    }
    title.textContent = s.phase === "done" ? "Terminé !" : `Manche ${s.round}/${CHRONO_ROUNDS}`;
    target.textContent = s.phase === "done" ? "" : `Objectif : ${formatSeconds(s.target)}`;
    if (s.phase === "ready") {
      clock.textContent = "0,00 s";
      clock.classList.remove("is-hidden");
      hint.textContent = `Retiens ce temps ! Le chrono va partir, puis disparaître au bout de ${CHRONO_VISIBLE_MS / 1000} s.`;
      barFill.style.width = "0%";
      bar.classList.remove("is-hidden");
    }
    stop.disabled = s.phase !== "run" || stoppedRound === s.round;
    clear(results);
    if (s.phase === "result" && s.stops) {
      clock.textContent = formatSeconds(s.target);
      clock.classList.remove("is-hidden");
      hint.textContent = "Voici le temps de chacun :";
      for (const p of ctx.players) {
        const t = s.stops[p.id];
        results.append(
          h(
            "li",
            { style: { "--player": PLAYER_COLORS[p.color]?.hex } },
            ctx.avatar(p.id, 26),
            h("strong", { text: t === undefined ? "pas arrêté" : formatSeconds(t) }),
            h("small", { text: t === undefined ? "" : Math.abs(t - s.target) < 50 ? "pile au bon moment !" : `${t < s.target ? "trop tôt" : "trop tard"} de ${formatSeconds(Math.abs(t - s.target))}` }),
          ),
        );
      }
    }
    if (ctx.layout !== "pad")
      scoreLanes(lanes, ctx.players, {
        score: (id) => -(s.totals[id] ?? 0),
        max: 1,
        me: ctx.me,
        avatar: ctx.avatar,
        label: (id) => formatSeconds(s.totals[id] ?? 0),
      });
  }

  return {
    update(next) {
      state = next as ChronoState;
      render();
    },
    destroy() {
      tick();
      window.removeEventListener("keydown", onKey);
    },
  };
}
