import "./style.css";
import { clear, h } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { REFLEX_ROUNDS, type ReflexOutcome, type ReflexState } from "./types.ts";

function describe(o: ReflexOutcome | null | undefined): string {
  if (!o) return "…";
  if (o.kind === "false-start") return "Faux départ";
  if (o.kind === "miss") return "Trop tard";
  return `${o.ms} ms`;
}

/**
 * « Dégaine ! » : un grand panneau qui passe au vert au signal.
 * Sur la manette et l'écran individuel, le panneau est le bouton.
 */
export function reflexesView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: ReflexState | null = null;
  /** Instant (performance.now) où le signal est apparu à l'écran. */
  let shownAt = 0;
  let shownSignal = -1;
  let tappedSignalTurn = -1;
  let flash = "";

  const turnLabel = h("p", { class: "rx__turn" });
  const panelText = h("strong", { class: "rx__text" });
  const panelSub = h("span", { class: "rx__sub" });
  const panel = interactive
    ? h("button", { class: "rx__panel", attrs: { type: "button" }, on: { pointerdown: (e) => (e.preventDefault(), tap()) } }, panelText, panelSub)
    : h("div", { class: "rx__panel" }, panelText, panelSub);
  const board = h("ol", { class: "rx__board" });

  root.append(h("div", { class: `mg rx rx--${ctx.layout}` }, turnLabel, panel, ctx.layout === "pad" ? null : board));

  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.key === "Enter") {
      e.preventDefault();
      tap();
    }
  };
  if (interactive) window.addEventListener("keydown", onKey);

  function tap(): void {
    if (!state || state.phase === "done" || tappedSignalTurn === state.turn) return;
    const mine = ctx.me ? state.outcomes[ctx.me]?.[state.turn - 1] : undefined;
    if (mine) return;
    tappedSignalTurn = state.turn;
    if (state.phase === "go" && shownSignal === state.signal) {
      const reactionMs = Math.round(performance.now() - shownAt);
      flash = `${reactionMs} ms`;
      ctx.send({ kind: "tap", signal: state.signal, reactionMs });
    } else {
      flash = "Faux départ !";
      ctx.send({ kind: "tap", signal: state.signal });
    }
    render();
  }

  function render(): void {
    if (!state) return;
    const s = state;
    turnLabel.textContent = `Manche ${s.turn} sur ${REFLEX_ROUNDS}`;
    const mine = ctx.me ? s.outcomes[ctx.me]?.[s.turn - 1] : undefined;

    panel.classList.toggle("is-go", s.phase === "go" && !mine);
    panel.classList.toggle("is-wait", s.phase === "wait" && !mine);
    panel.classList.toggle("is-done", s.phase === "done" || Boolean(mine));

    if (mine || (interactive && tappedSignalTurn === s.turn)) {
      panelText.textContent = mine ? describe(mine) : flash;
      panelSub.textContent = mine?.kind === "false-start" ? "Tu as appuyé avant le signal" : "Attends les autres…";
    } else if (s.phase === "wait") {
      panelText.textContent = "Attends…";
      panelSub.textContent = interactive ? "N'appuie pas encore !" : "Le signal arrive";
    } else if (s.phase === "go") {
      panelText.textContent = interactive ? "Appuie !" : "GO !";
      panelSub.textContent = "";
    } else {
      panelText.textContent = "Manche terminée";
      panelSub.textContent = "";
    }

    if (ctx.layout === "pad") return;
    clear(board);
    const rows = [...ctx.players].sort((a, b) => (s.totals[a.id] ?? 0) - (s.totals[b.id] ?? 0));
    for (const p of rows) {
      const outcome = s.outcomes[p.id]?.[s.turn - 1];
      board.append(
        h(
          "li",
          { class: `rx__row${p.id === ctx.me ? " is-me" : ""}${outcome?.kind === "false-start" ? " is-bad" : ""}` },
          ctx.avatar(p.id, 34),
          h("span", { class: "rx__name", text: p.name }),
          h("span", { class: "rx__now", text: describe(outcome) }),
          s.phase === "done" || s.turn > 1 ? h("span", { class: "rx__total", text: `${s.totals[p.id] ?? 0} ms` }) : null,
        ),
      );
    }
  }

  return {
    update(next) {
      const s = next as ReflexState;
      if (s.phase === "go" && s.signal !== shownSignal) {
        state = s;
        render();
        // Le chrono démarre quand le signal est réellement peint à l'écran.
        requestAnimationFrame(() => {
          shownAt = performance.now();
          shownSignal = s.signal;
        });
        return;
      }
      state = s;
      render();
    },
    destroy() {
      window.removeEventListener("keydown", onKey);
    },
  };
}
