import "../timing.css";
import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, everyFrame, h, scoreLanes, svg } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { localStart } from "../timing.ts";
import { FUEL, SAFE_SPEED, START_ALT, STEP_MS, simulate, type AlunissageState } from "./types.ts";

const NS = "http://www.w3.org/2000/svg";
const GROUND = 286;

/** « Alunissage » : maintenir pour freiner, se poser en douceur. */
export function alunissageView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: AlunissageState | null = null;
  let start = 0;
  let startedRound = 0;
  /** Mes commandes (instants de bascule du moteur), envoyées au serveur. */
  let mine: number[] = [];
  let holding = false;

  const title = h("p", { class: "tm__title", attrs: { "aria-live": "polite" } });
  const scene = svg(`<svg viewBox="0 0 640 320" role="img" aria-label="Capsules au-dessus de la Lune">
    <rect width="640" height="320" fill="#1e2a4a"/>
    ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 97) % 640}" cy="${(i * 53) % 230}" r="${i % 3 ? 1.2 : 2}" fill="#fff" opacity="${0.4 + (i % 4) * 0.15}"/>`).join("")}
    <path d="M0 ${GROUND} Q 80 ${GROUND - 14} 160 ${GROUND} T 320 ${GROUND} T 480 ${GROUND} T 640 ${GROUND} V320 H0Z" fill="#c9ced8"/>
    <circle cx="90" cy="304" r="9" fill="#aab1bf"/><circle cx="420" cy="306" r="12" fill="#aab1bf"/><circle cx="560" cy="300" r="6" fill="#aab1bf"/>
    <g class="land__ships"></g>
  </svg>`);
  const ships = scene.querySelector<SVGGElement>(".land__ships")!;
  const hudAlt = h("span", {});
  const hudSpeed = h("span", {});
  const fuelFill = h("span", { class: "land__fuel-fill" });
  const hud = h("div", { class: "land__hud" }, hudAlt, hudSpeed, h("span", { class: "land__fuel", attrs: { "aria-label": "Carburant" } }, "⛽", h("span", { class: "land__fuel-track" }, fuelFill)));
  const button = h("button", {
    class: "tm__btn land__btn",
    attrs: { type: "button" },
    text: "MOTEUR",
    on: {
      pointerdown: (e) => (e.preventDefault(), button.setPointerCapture?.(e.pointerId), set(true)),
      pointerup: () => set(false),
      pointercancel: () => set(false),
      lostpointercapture: () => set(false),
      contextmenu: (e) => e.preventDefault(),
    },
  });
  const results = h("ul", { class: "tm__results" });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg tm land land--${ctx.layout}` }, title, h("div", { class: "tm__stage" }, scene), interactive ? hud : null, interactive ? button : null, results, ctx.layout === "pad" ? null : lanes));

  const onDown = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter") && interactive) {
      e.preventDefault();
      if (!e.repeat) set(true);
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter") && interactive) set(false);
  };
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  function set(on: boolean): void {
    const s = state;
    if (!s || s.phase !== "fly" || !ctx.me || s.landed[ctx.me] || on === holding) return;
    const t = Math.max(0, Math.round((performance.now() - start) / STEP_MS) * STEP_MS);
    if (simulate(mine, t).landedAt !== null) return;
    holding = on;
    // Deux bascules au même instant s'annulent.
    if (mine.length && mine.at(-1)! >= t) mine.pop();
    else mine.push(t);
    ctx.send({ round: s.round, toggles: [...mine] });
    button.classList.toggle("is-on", on);
  }

  /** Une capsule dessinée à la couleur du joueur. */
  const shipEls = new Map<string, SVGGElement>();
  function ship(id: string): SVGGElement {
    let g = shipEls.get(id);
    if (!g) {
      g = document.createElementNS(NS, "g");
      const color = PLAYER_COLORS[ctx.players.find((p) => p.id === id)?.color ?? 0]?.hex ?? "#fff";
      g.innerHTML = `<path class="land__flame" d="M-8 14 L0 40 L8 14Z" fill="#ffc83d"/>
        <path d="M-16 14 L-22 24 M16 14 L22 24" stroke="#c9ced8" stroke-width="4" stroke-linecap="round"/>
        <path d="M-15 14 Q -18 -16 0 -22 Q 18 -16 15 14Z" fill="${color}" stroke="#fff" stroke-width="3"/>
        <circle cy="-4" r="6" fill="#cdebff" stroke="#fff" stroke-width="2"/>`;
      ships.append(g);
      shipEls.set(id, g);
    }
    return g;
  }

  const stop = everyFrame(() => {
    const s = state;
    if (!s) return;
    const flying = s.phase === "fly" || s.phase === "result";
    const now = flying ? performance.now() - start : 0;
    const shown = ctx.layout === "pad" && ctx.me ? ctx.players.filter((p) => p.id === ctx.me) : ctx.players;
    shown.forEach((p, i) => {
      const toggles = p.id === ctx.me ? mine : s.toggles[p.id] ?? [];
      const f = simulate(toggles, flying ? now : 0);
      const x = shown.length === 1 ? 320 : 60 + (i * 520) / Math.max(1, shown.length - 1);
      const y = Math.max(24, GROUND - 26 - (f.alt / START_ALT) * (GROUND - 70));
      const g = ship(p.id);
      const crashed = s.landed[p.id]?.crashed ?? (f.landedAt !== null && f.speed > SAFE_SPEED);
      g.setAttribute("transform", `translate(${x} ${y}) rotate(${crashed && f.landedAt !== null ? 70 : 0})`);
      g.classList.toggle("is-thrust", f.thrust && f.landedAt === null);
      g.classList.toggle("is-me", p.id === ctx.me);
      if (p.id === ctx.me) {
        hudAlt.textContent = `Altitude ${Math.ceil(f.alt)} m`;
        hudSpeed.textContent = f.speed >= 0 ? `Chute ${f.speed.toFixed(1)} m/s` : `Montée ${(-f.speed).toFixed(1)} m/s`;
        hudSpeed.classList.toggle("is-danger", f.speed > SAFE_SPEED);
        fuelFill.style.width = `${(f.fuel / FUEL) * 100}%`;
        if (f.landedAt !== null && holding) {
          holding = false;
          button.classList.remove("is-on");
        }
      }
    });
  });

  function render(): void {
    const s = state;
    if (!s) return;
    if (s.phase === "fly" && startedRound !== s.round) {
      startedRound = s.round;
      start = localStart(s.startedAt, ctx.serverNow);
      mine = [];
      holding = false;
      button.classList.remove("is-on");
    }
    if (s.phase === "ready") mine = [];
    title.textContent = s.phase === "done" ? "Terminé !" : `Essai ${s.round}/${s.rounds} · ${s.phase === "ready" ? "Prépare-toi…" : "Maintiens pour freiner, pose-toi en douceur !"}`;
    button.disabled = s.phase !== "fly" || Boolean(ctx.me && s.landed[ctx.me]);
    clear(results);
    for (const p of ctx.players) {
      const r = s.landed[p.id];
      if (!r) continue;
      results.append(h("li", { class: r.crashed ? "" : "is-best", style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(p.id, 26), h("strong", { text: r.crashed ? "Crash !" : `${r.score} pts` })));
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.best[id] ?? 0, max: 100, me: ctx.me, avatar: ctx.avatar, label: (_, n) => `${n} pts` });
  }

  return {
    update(next) {
      state = next as AlunissageState;
      render();
    },
    destroy() {
      stop();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    },
  };
}
