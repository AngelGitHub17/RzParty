import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, mount3D, timeBar } from "../kit.ts";
import { castPlayers } from "../three/players.ts";
import type { EscalierScene } from "./scene3d.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { STAIRS, STEP_CHOICE_MS, STEP_REVEAL_MS, type EscalierState } from "./types.ts";

/** « Escalier secret » : un escalier par joueur, trois gros boutons pour choisir. */
export function escalierView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: EscalierState | null = null;
  let myPick = 0;
  const bar = timeBar(ctx.serverNow);
  const title = h("p", { class: "stairs__title", attrs: { "aria-live": "polite" } });
  const stairs = h("div", { class: "stairs__lanes" });
  const buttons = h(
    "div",
    { class: "stairs__buttons" },
    ...[1, 2, 3].map((n) =>
      h("button", {
        class: "stairs__btn",
        attrs: { type: "button", "data-n": n },
        text: `+${n}`,
        on: { click: () => pick(n) },
      }),
    ),
  );
  const onKey = (e: KeyboardEvent) => {
    if (["1", "2", "3"].includes(e.key) && interactive) pick(Number(e.key));
  };
  window.addEventListener("keydown", onKey);
  // En 3D quand c'est possible (les escaliers 2D restent là sinon).
  const box = h("div", { class: "mg3d-box stairs__box" }, stairs);
  let scene: EscalierScene | null = null;
  let gone = false;
  if (!(ctx.layout === "pad" && interactive))
    mount3D(box, () => import("./scene3d.ts"), ({ EscalierScene }, host) => {
      if (gone) return false;
      scene = new EscalierScene(host, castPlayers(ctx));
      if (state) scene.update(state);
      return true;
    });
  root.append(h("div", { class: `mg stairs stairs--${ctx.layout}` }, bar.el, title, interactive ? buttons : null, ctx.layout === "pad" && interactive ? null : box));

  function pick(n: number): void {
    if (!state || state.phase !== "choose") return;
    myPick = n;
    ctx.send({ round: state.round, steps: n });
    render();
  }

  let lastRound = 0;
  function render(): void {
    if (!state) return;
    const s = state;
    if (s.round !== lastRound) {
      lastRound = s.round;
      myPick = 0;
    }
    bar.set(s.phaseEndsAt - (s.phase === "choose" ? STEP_CHOICE_MS : STEP_REVEAL_MS), s.phaseEndsAt);
    title.textContent =
      s.phase === "choose"
        ? `Manche ${s.round} · Choisis en secret : 1, 2 ou 3 marches (${s.chosen.length}/${ctx.players.length} ont choisi)`
        : s.phase === "reveal"
          ? s.blocked.length
            ? "Même choix = personne n'avance pour eux !"
            : "Tout le monde avance !"
          : "Terminé !";
    buttons.querySelectorAll<HTMLButtonElement>(".stairs__btn").forEach((b) => {
      b.classList.toggle("is-on", Number(b.dataset.n) === myPick);
      b.disabled = s.phase !== "choose";
    });
    if (ctx.layout === "pad" && interactive && ctx.me) {
      title.textContent += ` · Tu es sur la marche ${s.heights[ctx.me]}/${STAIRS}`;
      return;
    }
    scene?.update(s);
    clear(stairs);
    for (const p of ctx.players) {
      const height = s.heights[p.id] ?? 0;
      const pickValue = s.picks?.[p.id];
      const lane = h(
        "div",
        { class: `stairs__lane${p.id === ctx.me ? " is-me" : ""}${s.blocked.includes(p.id) ? " is-blocked" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
        h(
          "div",
          { class: "stairs__steps" },
          ...Array.from({ length: STAIRS }, (_, i) => h("span", { class: `stairs__step${i < height ? " is-climbed" : ""}`, style: { height: `${((i + 1) / STAIRS) * 100}%` } })),
          h(
            "span",
            {
              class: "stairs__climber",
              // Sur la marche atteinte : centré sur elle, posé sur son dessus (36 px de marge en haut pour l'avatar).
              style: { left: `${(Math.max(0.5, height - 0.5) / STAIRS) * 100}%`, bottom: `calc(${height / STAIRS} * (100% - 36px))` },
            },
            ctx.avatar(p.id, 34),
          ),
        ),
        h(
          "p",
          { class: "stairs__label" },
          h("strong", { text: p.name }),
          h("span", { text: pickValue ? `a joué +${pickValue}${s.blocked.includes(p.id) ? " (bloqué)" : ""}` : s.chosen.includes(p.id) ? "a choisi ✓" : "réfléchit…" }),
        ),
      );
      stairs.append(lane);
    }
  }

  return {
    update(next) {
      state = next as EscalierState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      bar.destroy();
      window.removeEventListener("keydown", onKey);
    },
  };
}
