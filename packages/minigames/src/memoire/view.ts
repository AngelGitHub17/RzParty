import "./style.css";
import { clear, h, svg, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { alphabet, inputDuration, showDuration, type MemoState } from "./types.ts";

const COLOR_HEX: Record<string, string> = {
  rouge: "#F0483E",
  bleu: "#2F7BEF",
  jaune: "#F7C21B",
  vert: "#2DB866",
  orange: "#FF8A1F",
  violet: "#9257E8",
};

const COLOR_LABEL: Record<string, string> = {
  rouge: "rouge",
  bleu: "bleu",
  jaune: "jaune",
  vert: "vert",
  orange: "orange",
  violet: "violet",
};

const SHAPE_PATH: Record<string, string> = {
  rond: `<circle cx="20" cy="20" r="15"/>`,
  carre: `<rect x="6" y="6" width="28" height="28" rx="5"/>`,
  triangle: `<path d="M20 4 37 34H3z" stroke-linejoin="round"/>`,
  etoile: `<path d="m20 3 4.9 10.5 11.5 1.3-8.6 7.8 2.4 11.4L20 28.2 9.8 34l2.4-11.4-8.6-7.8 11.5-1.3z" stroke-linejoin="round"/>`,
  coeur: `<path d="M20 35 6 21.5A8.5 8.5 0 0 1 20 10a8.5 8.5 0 0 1 14 11.5z" stroke-linejoin="round"/>`,
  losange: `<path d="M20 3 36 20 20 37 4 20z" stroke-linejoin="round"/>`,
};

const SHAPE_LABEL: Record<string, string> = {
  rond: "rond",
  carre: "carré",
  triangle: "triangle",
  etoile: "étoile",
  coeur: "cœur",
  losange: "losange",
};

/** Dessine un élément à retenir : couleur, forme, chiffre ou forme colorée (« disparu »). */
function itemEl(token: string, size: "big" | "small" = "big"): HTMLElement {
  const el = buildItem(token, size);
  el.dataset.token = token;
  return el;
}

function buildItem(token: string, size: "big" | "small"): HTMLElement {
  const cls = `memo__item memo__item--${size}`;
  if (token in COLOR_HEX) {
    return h("span", { class: `${cls} memo__item--color`, style: { "--item": COLOR_HEX[token] }, attrs: { role: "img", "aria-label": COLOR_LABEL[token] } });
  }
  const [shape, color] = token.split(":");
  if (shape && shape in SHAPE_PATH) {
    const fill = color ? COLOR_HEX[color] : "#1E2A4A";
    const label = color ? `${SHAPE_LABEL[shape]} ${COLOR_LABEL[color]}` : SHAPE_LABEL[shape];
    return h(
      "span",
      { class: `${cls} memo__item--shape`, attrs: { role: "img", "aria-label": label } },
      svg(`<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="${fill}" stroke="#1E2A4A" stroke-width="${color ? 2 : 0}">${SHAPE_PATH[shape]}</g></svg>`),
    );
  }
  return h("span", { class: `${cls} memo__item--digit`, text: token });
}

/**
 * « Mémo-flash » : une variante différente à chaque niveau.
 * La saisie se fait avec de grosses touches ; la réponse part toute seule une fois complète.
 */
export function memoireView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  let state: MemoState | null = null;
  let typed: string[] = [];
  let typedLevel = 0;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  const canPlay = ctx.layout !== "tv" && ctx.me !== null;

  const bar = timeBar(ctx.serverNow);
  const title = h("p", { class: "memo__title" });
  const board = h("div", { class: "memo__board", attrs: { "aria-live": "polite" } });
  const answer = h("div", { class: "memo__answer" });
  const keys = h("div", { class: "memo__keys" });
  const hint = h("p", { class: "memo__hint" });
  const players = h("ul", { class: "memo__players" });

  root.append(
    h(
      "div",
      { class: `mg memo memo--${ctx.layout}` },
      bar.el,
      title,
      board,
      canPlay ? h("div", { class: "memo__play" }, answer, keys, hint) : null,
      ctx.layout === "pad" ? null : players,
    ),
  );

  const myStatus = () => (state && ctx.me ? state.status[ctx.me] : undefined);
  const canType = () => canPlay && state?.phase === "input" && myStatus() === "en-jeu";

  function press(token: string): void {
    if (!state || !canType()) return;
    if (state.variant === "disparu") {
      typed = [token];
      ctx.send({ items: typed });
      render();
      return;
    }
    if (typed.length >= state.length) return;
    typed = [...typed, token];
    if (typed.length === state.length) {
      // Petit délai : on voit sa réponse complète et on peut encore corriger.
      sendTimer = setTimeout(() => {
        sendTimer = null;
        if (canType() && typed.length === state!.length) ctx.send({ items: typed });
      }, 700);
    }
    render();
  }

  function undo(): void {
    if (!canType()) return;
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = null;
    typed = typed.slice(0, -1);
    render();
  }

  const onKey = (e: KeyboardEvent) => {
    if (!state || !canType()) return;
    if (e.key === "Backspace") return (e.preventDefault(), undo());
    if (state.variant === "chiffres" && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      press(e.key);
    }
  };
  if (canPlay) window.addEventListener("keydown", onKey);

  function render(): void {
    if (!state) return;
    const s = state;
    if (typedLevel !== s.level) {
      typedLevel = s.level;
      typed = [];
      if (sendTimer) clearTimeout(sendTimer);
      sendTimer = null;
    }
    const st = myStatus();

    if (s.phase === "show") bar.set(s.phaseEndsAt - showDuration(s.length), s.phaseEndsAt);
    else if (s.phase === "input") bar.set(s.phaseEndsAt - inputDuration(s.length), s.phaseEndsAt);
    else bar.set(0, 0);

    const what = s.variant === "couleurs" ? "couleurs" : s.variant === "formes" ? "formes" : s.variant === "chiffres" ? "chiffres" : "objets";
    title.textContent =
      s.phase === "show"
        ? s.variant === "disparu"
          ? `Niveau ${s.level} : retiens ces ${s.length} objets`
          : `Niveau ${s.level} : retiens ces ${s.length} ${what}, dans l'ordre`
        : s.phase === "input"
          ? s.variant === "disparu"
            ? "Lequel a disparu ?"
            : "Refais la suite"
          : s.phase === "check"
            ? "Solution"
            : "Fin de la manche";

    // Plateau central : ce qu'il faut retenir, ou la rangée trouée.
    clear(board);
    if (s.phase === "show" && ctx.layout === "pad") {
      board.append(h("p", { class: "memo__look", text: "Regarde l'écran commun !" }));
    } else if (s.phase === "show" && s.items) {
      board.append(...s.items.map((t) => itemEl(t)));
    } else if (s.phase === "input" && s.variant === "disparu" && s.holed && ctx.layout !== "pad") {
      board.append(...s.holed.map((t) => (t ? itemEl(t) : h("span", { class: "memo__item memo__item--big memo__item--hole", text: "?" }))));
    } else if (s.phase === "input" && ctx.layout === "tv") {
      board.append(...Array.from({ length: s.length }, () => h("span", { class: "memo__item memo__item--big memo__item--hole", text: "?" })));
    } else if (s.phase === "check" && s.items) {
      board.append(...s.items.map((t) => {
        const el = itemEl(t);
        if (s.missing === t) el.classList.add("is-answer");
        return el;
      }));
    }

    if (canPlay) {
      clear(answer);
      clear(keys);
      if (s.phase === "input" && st === "en-jeu") {
        if (s.variant === "disparu") {
          keys.className = "memo__keys memo__keys--choices";
          keys.append(...(s.choices ?? []).map((t) => keyButton(t, typed[0] === t)));
        } else {
          for (let i = 0; i < s.length; i++) {
            const t = typed[i];
            answer.append(t ? itemEl(t, "small") : h("span", { class: "memo__item memo__item--small memo__item--empty" }));
          }
          keys.className = `memo__keys memo__keys--${s.variant}`;
          keys.append(...alphabet(s.variant).map((t) => keyButton(t, false)));
          keys.append(
            h("button", {
              class: "memo__undo btn btn--ghost",
              attrs: { type: "button", disabled: typed.length === 0 },
              text: "Effacer",
              on: { click: undo },
            }),
          );
        }
      }
      hint.textContent =
        st === "elimine"
          ? "Tu es éliminé de ce mini-jeu. Regarde qui tiendra le plus longtemps !"
          : st === "envoye"
            ? "Réponse envoyée. Attends les autres…"
            : s.phase === "check" && ctx.me
              ? s.lastCheck[ctx.me]
                ? "Bravo, niveau suivant !"
                : ""
              : canType() && s.variant !== "disparu" && typed.length === s.length
                ? "Envoi…"
                : "";
    }

    if (ctx.layout === "pad") return;
    clear(players);
    for (const p of ctx.players) {
      const pst = s.status[p.id];
      const check = s.phase === "check" ? s.lastCheck[p.id] : undefined;
      const label =
        pst === "elimine" && check === undefined ? "éliminé" : check === true ? "juste" : check === false ? "raté" : pst === "envoye" ? "envoyé" : "";
      players.append(
        h(
          "li",
          { class: `memo__player is-${pst}${check === false ? " is-wrong" : ""}${p.id === ctx.me ? " is-me" : ""}` },
          ctx.avatar(p.id, 34),
          h("span", { text: p.name }),
          label ? h("small", { text: label }) : null,
        ),
      );
    }
  }

  function keyButton(token: string, selected: boolean): HTMLElement {
    return h(
      "button",
      {
        class: `memo__key${selected ? " is-on" : ""}`,
        attrs: { type: "button", "data-token": token },
        on: { pointerdown: (e) => (e.preventDefault(), press(token)) },
      },
      itemEl(token),
    );
  }

  return {
    update(next) {
      state = next as MemoState;
      render();
    },
    destroy() {
      bar.destroy();
      if (sendTimer) clearTimeout(sendTimer);
      window.removeEventListener("keydown", onKey);
    },
  };
}
