import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import type { BombeState } from "./types.ts";

const BOMB = "💣";

/**
 * « Patate explosive » : les joueurs en cercle, la bombe passe de l'un à l'autre.
 * Le porteur touche les lettres du mot (boutons, ou les mêmes lettres au clavier).
 */
export function bombeView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: BombeState | null = null;

  const ring = h("div", { class: "bomb__ring" });
  const headline = h("p", { class: "bomb__headline", attrs: { "aria-live": "polite" } });
  const word = h("p", { class: "bomb__word" });
  const keys = h("div", { class: "bomb__keys" });
  let keysFor = -1;

  const tap = (index: number) => {
    if (!state || state.holder !== ctx.me) return;
    ctx.send({ pass: state.pass, letter: index });
  };
  const onKey = (e: KeyboardEvent) => {
    if (!interactive || !state || state.holder !== ctx.me || e.key.length !== 1) return;
    const index = state.letters.indexOf(e.key.toUpperCase());
    if (index < 0) return;
    e.preventDefault();
    tap(index);
  };
  window.addEventListener("keydown", onKey);

  root.append(
    h(
      "div",
      { class: `mg bomb bomb--${ctx.layout}` },
      headline,
      ctx.layout === "pad" ? null : ring,
      interactive ? h("div", { class: "bomb__work" }, word, keys) : null,
    ),
  );

  const name = (id: string | null) => ctx.players.find((p) => p.id === id)?.name ?? "?";

  function renderRing(s: BombeState): void {
    clear(ring);
    const n = ctx.players.length;
    ctx.players.forEach((p, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const out = s.out.includes(p.id);
      const holding = s.holder === p.id;
      const blasted = s.blast?.playerId === p.id;
      ring.append(
        h(
          "div",
          {
            class: `bomb__seat${out ? " is-out" : ""}${holding ? ` is-holding heat-${s.heat}` : ""}${blasted ? " is-blasted" : ""}${p.id === ctx.me ? " is-me" : ""}${s.target === p.id ? " is-target" : ""}`,
            style: { left: `${50 + Math.cos(angle) * 40}%`, top: `${50 + Math.sin(angle) * 38}%`, "--player": PLAYER_COLORS[p.color]?.hex },
          },
          ctx.avatar(p.id, ctx.layout === "tv" ? 64 : 48),
          h("span", { class: "bomb__name", text: p.name }),
          holding ? h("span", { class: "bomb__bomb", text: BOMB }) : null,
          blasted ? h("span", { class: "bomb__boom", text: "BOUM !" }) : null,
        ),
      );
    });
  }

  function renderWork(s: BombeState): void {
    const mine = s.holder === ctx.me;
    word.hidden = !mine;
    keys.hidden = !mine;
    if (!mine) return;
    clear(word);
    s.word.split("").forEach((c, i) => word.append(h("span", { class: i < s.progress ? "is-done" : i === s.progress ? "is-next" : "", text: c })));
    // Les boutons restent les mêmes pendant une passe (pas de saut sous le doigt).
    if (keysFor !== s.pass) {
      keysFor = s.pass;
      clear(keys);
      s.letters.forEach((c, i) =>
        keys.append(
          h("button", {
            class: "bomb__key",
            attrs: { type: "button" },
            text: c,
            on: {
              pointerdown: (e) => {
                e.preventDefault();
                tap(i);
              },
            },
          }),
        ),
      );
    }
  }

  function render(): void {
    if (!state) return;
    const s = state;
    root.querySelector(".bomb")?.classList.toggle("is-mine", s.holder === ctx.me && s.holder !== null);
    if (s.finished) headline.textContent = `${name(s.alive[0] ?? null)} gagne !`;
    else if (s.blast && !s.holder) headline.textContent = s.blast.playerId === ctx.me ? "BOUM ! Tu es éliminé…" : `BOUM ! ${name(s.blast.playerId)} est éliminé`;
    else if (!s.holder) headline.textContent = "Une bombe arrive…";
    else if (s.holder === ctx.me) headline.textContent = `Tu as la bombe ! Tape le mot pour l'envoyer à ${name(s.target)}`;
    else if (ctx.me && s.out.includes(ctx.me)) headline.textContent = `Éliminé. ${name(s.holder)} a la bombe.`;
    else headline.textContent = `${name(s.holder)} a la bombe → ${name(s.target)}`;
    if (ctx.layout !== "pad") renderRing(s);
    if (interactive) renderWork(s);
  }

  return {
    update(next) {
      state = next as BombeState;
      render();
    },
    destroy() {
      window.removeEventListener("keydown", onKey);
    },
  };
}
