import "../timing.css";
import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, scoreLanes } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { CHANNELS, type ZappeurState } from "./types.ts";

/** « Zappeur fou » : une télé qui zappe, un bouton pour la bonne chaîne. */
export function zappeurView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: ZappeurState | null = null;
  /** Instant local où le zap en cours est apparu sur cet appareil. */
  let shownAt = 0;
  let shownZap = "";
  let pressedRound = 0;

  const title = h("p", { class: "tm__title", attrs: { "aria-live": "polite" } });
  const wanted = h("div", { class: "zap__wanted" });
  const icon = h("span", { class: "zap__icon", attrs: { "aria-hidden": "true" } });
  const label = h("span", { class: "zap__label" });
  const screen = h("div", { class: "zap__screen" }, icon, label);
  const tv = h("div", { class: "zap__tv" }, screen, h("span", { class: "zap__foot" }));
  const button = h("button", { class: "tm__btn zap__btn", attrs: { type: "button" }, text: "C'EST ELLE !", on: { pointerdown: (e) => (e.preventDefault(), press()) } });
  const results = h("ul", { class: "tm__results" });
  const lanes = h("ol", {});
  root.append(
    h("div", { class: `mg tm zap zap--${ctx.layout}` }, title, wanted, ctx.layout === "pad" ? null : tv, interactive ? button : null, results, ctx.layout === "pad" ? null : lanes),
  );
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter") && interactive) {
      e.preventDefault();
      press();
    }
  };
  window.addEventListener("keydown", onKey);

  function press(): void {
    const s = state;
    if (!s || s.phase !== "zap" || pressedRound === s.round || !ctx.me || s.locked.includes(ctx.me)) return;
    pressedRound = s.round;
    ctx.send({ round: s.round, zap: s.zapIndex, dt: Math.round(performance.now() - shownAt) });
    render();
  }

  function render(): void {
    const s = state;
    if (!s) return;
    const key = `${s.round}:${s.zapIndex}`;
    if (key !== shownZap) {
      shownZap = key;
      shownAt = performance.now();
      screen.classList.remove("is-zapping");
      void screen.offsetWidth;
      screen.classList.add("is-zapping");
    }
    const target = CHANNELS[s.target]!;
    title.textContent = s.phase === "done" ? "Terminé !" : `Manche ${s.round}/${s.rounds}${s.phase === "ready" ? " · Prêt…" : ""}`;
    clear(wanted);
    wanted.append(h("span", { text: "Trouve la chaîne" }), h("strong", { style: { "--c": target.color } }, `${target.icon} ${target.name}`));
    const ch = s.zap ? CHANNELS[s.zap.channel]! : null;
    icon.textContent = s.phase === "ready" ? "📺" : ch?.icon ?? "";
    label.textContent = s.phase === "ready" ? "Attention…" : ch?.name ?? "";
    screen.style.setProperty("--c", s.phase === "ready" ? "#56627f" : ch?.color ?? "#56627f");

    const me = ctx.me;
    const locked = me !== null && s.locked.includes(me);
    button.disabled = s.phase !== "zap" || pressedRound === s.round || locked;
    button.textContent = locked ? "BLOQUÉ !" : pressedRound === s.round && s.phase === "zap" ? "TROUVÉ !" : "C'EST ELLE !";
    button.classList.toggle("is-locked", locked);
    if (ctx.layout === "pad" && s.phase !== "ready") {
      // Sur la manette, l'écran de la télé est aussi rappelé en petit.
      wanted.append(h("span", { class: "zap__mini", style: { "--c": ch?.color ?? "#56627f" }, text: ch ? `${ch.icon} ${ch.name}` : "" }));
    }

    clear(results);
    if (s.phase === "result" && s.times) {
      for (const p of ctx.players) {
        const t = s.times[p.id];
        const text = t !== undefined ? `${Math.round(t)} ms` : s.locked.includes(p.id) ? "bloqué" : "raté";
        results.append(h("li", { class: p.id === s.winner ? "is-best" : "", style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(p.id, 26), h("strong", { text: p.id === s.winner ? `★ ${text}` : text })));
      }
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, max: s.rounds, me: ctx.me, avatar: ctx.avatar });
  }

  return {
    update(next) {
      state = next as ZappeurState;
      render();
    },
    destroy() {
      window.removeEventListener("keydown", onKey);
    },
  };
}
