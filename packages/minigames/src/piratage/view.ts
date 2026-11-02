import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, keypad, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { CODE_LENGTH, MAX_TRIES, PIRATAGE_DURATION_MS, type Feedback, type PiratagePrivate, type PiratageState } from "./types.ts";

function pegs(feedback: Feedback): HTMLElement {
  const dots: HTMLElement[] = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    const kind = i < feedback.exact ? "exact" : i < feedback.exact + feedback.near ? "near" : "none";
    dots.push(h("span", { class: `hack__peg hack__peg--${kind}` }));
  }
  return h("span", { class: "hack__pegs", attrs: { "aria-label": `${feedback.exact} bien placé(s), ${feedback.near} mal placé(s)` } }, ...dots);
}

/**
 * « Piratage » : chacun cherche le même code secret, avec ses propres essais.
 * L'écran commun montre l'avancée de chacun (sans les chiffres).
 */
export function piratageView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: PiratageState | null = null;
  let mine: PiratagePrivate = { guesses: [] };
  let typed = "";

  const bar = timeBar(ctx.serverNow);
  const lanes = h("ol", { class: "hack__lanes" });
  const slots = h("div", { class: "hack__slots", attrs: { "aria-live": "polite" } });
  const history = h("ol", { class: "hack__history" });
  const info = h("p", { class: "hack__info" });
  const reveal = h("p", { class: "hack__reveal", attrs: { hidden: true } });

  const pad = interactive
    ? keypad({
        keys: ["1", "2", "3", "4", "5", "6", "back", "ok"],
        onKey(key) {
          if (!state || state.finished || done()) return;
          if (key === "back") typed = typed.slice(0, -1);
          else if (key === "ok") return submit();
          else if (typed.length < CODE_LENGTH && !typed.includes(key)) typed += key;
          renderSlots();
        },
      })
    : null;

  root.append(
    h(
      "div",
      { class: `mg hack hack--${ctx.layout}` },
      bar.el,
      reveal,
      interactive ? h("div", { class: "hack__work" }, info, history, slots, pad!.el) : null,
      ctx.layout === "pad" ? null : lanes,
    ),
  );

  function done(): boolean {
    const p = ctx.me ? state?.progress[ctx.me] : undefined;
    return !p || p.cracked || p.tries >= MAX_TRIES;
  }

  function submit(): void {
    if (typed.length !== CODE_LENGTH) return;
    ctx.send({ guess: typed });
    typed = "";
    renderSlots();
  }

  function renderSlots(): void {
    clear(slots);
    for (let i = 0; i < CODE_LENGTH; i++) slots.append(h("span", { class: `hack__slot${typed[i] ? " is-full" : ""}`, text: typed[i] ?? "" }));
    // Les chiffres déjà tapés sont grisés (un code n'a jamais deux fois le même chiffre).
    pad?.el.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((b) => {
      const k = b.dataset.key!;
      b.disabled = /^[1-6]$/.test(k) && typed.includes(k);
      if (k === "ok") b.disabled = typed.length !== CODE_LENGTH;
    });
  }

  function renderPrivate(): void {
    clear(history);
    for (const g of mine.guesses) {
      history.append(
        h(
          "li",
          { class: `hack__try${g.feedback.exact === CODE_LENGTH ? " is-win" : ""}` },
          h(
            "span",
            { class: "hack__digits", attrs: { "aria-label": `${g.guess} : ${g.feedback.exact} bien placé(s), ${g.feedback.near} mal placé(s)` } },
            ...g.guess.split("").map((d, i) => h("span", { class: `hack__digit hack__digit--${g.marks[i] ?? "none"}`, text: d })),
          ),
        ),
      );
    }
    history.scrollTop = history.scrollHeight;
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - PIRATAGE_DURATION_MS, s.endsAt);
    reveal.hidden = !s.code;
    if (s.code) reveal.textContent = `Le code était ${s.code.split("").join(" ")}`;
    if (interactive && ctx.me) {
      const p = s.progress[ctx.me];
      info.textContent = !p
        ? ""
        : p.cracked
          ? `Code trouvé en ${p.tries} essai${p.tries > 1 ? "s" : ""} !`
          : p.tries >= MAX_TRIES
            ? "Plus d'essais. Attends les autres…"
            : s.finished
              ? "Temps écoulé !"
              : `Essai ${p.tries + 1} sur ${MAX_TRIES} · vert = bonne place, orange = ailleurs, gris = absent`;
    }
    if (ctx.layout === "pad") return;
    clear(lanes);
    const rows = [...ctx.players].sort((a, b) => {
      const pa = s.progress[a.id]!, pb = s.progress[b.id]!;
      if (pa.cracked !== pb.cracked) return pa.cracked ? -1 : 1;
      return pb.best.exact * 2 + pb.best.near - (pa.best.exact * 2 + pa.best.near);
    });
    for (const pl of rows) {
      const p = s.progress[pl.id];
      if (!p) continue;
      lanes.append(
        h(
          "li",
          { class: `hack__lane${pl.id === ctx.me ? " is-me" : ""}${p.cracked ? " is-cracked" : ""}`, style: { "--player": PLAYER_COLORS[pl.color]?.hex } },
          ctx.avatar(pl.id, 34),
          h("span", { class: "hack__name", text: pl.name }),
          h("span", { class: "hack__trail" }, ...p.history.slice(-4).map((f) => pegs(f))),
          h("strong", { class: "hack__count", text: p.cracked ? "Trouvé !" : `${p.tries}/${MAX_TRIES}` }),
        ),
      );
    }
  }

  renderSlots();
  return {
    update(next) {
      state = next as PiratageState;
      render();
      renderSlots();
    },
    updatePrivate(data) {
      mine = data as PiratagePrivate;
      renderPrivate();
    },
    destroy() {
      bar.destroy();
      pad?.destroy();
    },
  };
}
