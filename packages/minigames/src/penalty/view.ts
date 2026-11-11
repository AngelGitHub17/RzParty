import "../timing.css";
import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, everyFrame, h, mount3D, scoreLanes, svg } from "../kit.ts";
import type { PenaltyScene } from "./scene3d.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { localStart } from "../timing.ts";
import { DIR_LABELS, GOLD, GREEN, gauge, type Dir, type PenaltyState, type ShotOutcome } from "./types.ts";

const OUTCOME: Record<ShotOutcome, string> = { but: "BUT !", arret: "Arrêté", dessus: "Au-dessus", rate: "Pas tiré" };
const MARK: Record<ShotOutcome, string> = { but: "⚽", arret: "🧤", dessus: "↑", rate: "·" };
const X = [130, 320, 510];

/** « Tirs au but » : jauge de puissance, trois directions, un gardien imprévisible. */
export function penaltyView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: PenaltyState | null = null;
  let start = 0;
  let startedShot = 0;
  let firedShot = 0;
  let myPower: number | null = null;

  const title = h("p", { class: "tm__title", attrs: { "aria-live": "polite" } });
  const scene = svg(`<svg viewBox="0 0 640 300" role="img" aria-label="But et gardien">
    <rect width="640" height="300" fill="#7ed957"/>
    <rect y="0" width="640" height="120" fill="#cdebff"/>
    <path d="M40 250 H600" stroke="#fff" stroke-width="4"/>
    <rect x="40" y="40" width="560" height="210" fill="none" stroke="#fff" stroke-width="10" rx="4"/>
    <path d="M40 40 L80 70 H560 L600 40 M80 70 V250 M560 70 V250" stroke="#ffffffaa" stroke-width="3" fill="none"/>
    <g class="pen__net" stroke="#ffffff55" stroke-width="2">${Array.from({ length: 13 }, (_, i) => `<path d="M${90 + i * 40} 72 V250"/>`).join("")}${Array.from({ length: 5 }, (_, i) => `<path d="M80 ${90 + i * 36} H560"/>`).join("")}</g>
    <g class="pen__keeper" transform="translate(320 180)">
      <rect x="-26" y="-40" width="52" height="70" rx="22" fill="#f0483e"/>
      <circle cy="-56" r="20" fill="#ffd9b8"/>
      <circle cx="-7" cy="-58" r="3" fill="#1e2a4a"/><circle cx="7" cy="-58" r="3" fill="#1e2a4a"/>
      <rect x="-62" y="-36" width="36" height="14" rx="7" fill="#f0483e"/><rect x="26" y="-36" width="36" height="14" rx="7" fill="#f0483e"/>
      <circle cx="-64" cy="-29" r="11" fill="#ffc83d"/><circle cx="64" cy="-29" r="11" fill="#ffc83d"/>
    </g>
    <g class="pen__ball" transform="translate(320 285)"><circle r="16" fill="#fff" stroke="#1e2a4a" stroke-width="3"/><path d="M-6 -5 L6 -5 L9 5 L0 11 L-9 5Z" fill="#1e2a4a"/></g>
    <text class="pen__say" x="320" y="34" text-anchor="middle"></text>
  </svg>`);
  const keeper = scene.querySelector<SVGGElement>(".pen__keeper")!;
  const ball = scene.querySelector<SVGGElement>(".pen__ball")!;
  const say = scene.querySelector<SVGTextElement>(".pen__say")!;

  const cursor = h("span", { class: "pen__cursor" });
  const meter = h(
    "div",
    { class: "pen__meter", attrs: { "aria-hidden": "true" } },
    h("span", { class: "pen__zone", style: { bottom: `${GREEN[0] * 100}%`, height: `${(GREEN[1] - GREEN[0]) * 100}%` } }),
    h("span", { class: "pen__zone pen__zone--gold", style: { bottom: `${GOLD[0] * 100}%`, height: `${(GOLD[1] - GOLD[0]) * 100}%` } }),
    cursor,
  );
  const buttons = ([0, 1, 2] as Dir[]).map((d) =>
    h("button", { class: "pen__btn", attrs: { type: "button", "data-dir": d }, text: ["◀ ", "▲ ", "▶ "][d] + DIR_LABELS[d], on: { pointerdown: (e) => (e.preventDefault(), fire(d)) } }),
  );
  const pad = h("div", { class: "pen__pad" }, ...buttons);
  const results = h("ul", { class: "tm__results" });
  const lanes = h("ol", {});
  // En 3D quand c'est possible (le dessin 2D reste là sinon).
  const box = h("div", { class: "mg3d-box pen__box" }, scene);
  let scene3d: PenaltyScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ PenaltyScene }, host) => {
    if (gone) return false;
    scene3d = new PenaltyScene(host);
    scene3d.setShooter(ctx.me ? (ctx.avatarData?.(ctx.me) ?? null) : null);
    render();
    return true;
  });
  root.append(
    h(
      "div",
      { class: `mg tm pen pen--${ctx.layout}` },
      title,
      h("div", { class: "pen__row" }, h("div", { class: "tm__stage" }, box), interactive || ctx.layout === "tv" ? meter : null),
      interactive ? pad : null,
      results,
      ctx.layout === "pad" ? null : lanes,
    ),
  );

  const KEYS: Record<string, Dir> = { ArrowLeft: 0, q: 0, a: 0, ArrowUp: 1, ArrowDown: 1, s: 1, z: 1, w: 1, ArrowRight: 2, d: 2 };
  const onKey = (e: KeyboardEvent) => {
    const d = KEYS[e.key];
    if (d === undefined || !interactive) return;
    e.preventDefault();
    fire(d);
  };
  window.addEventListener("keydown", onKey);

  function fire(dir: Dir): void {
    const s = state;
    if (!s || s.phase !== "aim" || firedShot === s.shot) return;
    firedShot = s.shot;
    const t = Math.round(performance.now() - start);
    myPower = gauge(t);
    ctx.send({ shot: s.shot, dir, t });
    render();
  }

  const stop = everyFrame(() => {
    const s = state;
    if (!s) return;
    const p = s.phase === "aim" && firedShot !== s.shot ? gauge(performance.now() - start) : (myPower ?? 0);
    cursor.style.bottom = `calc(${p * 100}% - 4px)`;
  });

  function place(dir: Dir | null, keeperDir: Dir | null, outcome: ShotOutcome | null): void {
    keeper.setAttribute("transform", keeperDir === null ? "translate(320 180)" : `translate(${X[keeperDir]} ${keeperDir === 1 ? 160 : 190}) rotate(${keeperDir === 0 ? -35 : keeperDir === 2 ? 35 : 0})`);
    if (dir === null || outcome === null || outcome === "rate") {
      ball.setAttribute("transform", "translate(320 285)");
      return;
    }
    const y = outcome === "dessus" ? 10 : outcome === "arret" ? 175 : 120;
    ball.setAttribute("transform", `translate(${X[dir]} ${y})`);
  }

  function render(): void {
    const s = state;
    if (!s) return;
    if (s.phase === "aim" && startedShot !== s.shot) {
      startedShot = s.shot;
      start = localStart(s.startedAt, ctx.serverNow);
      myPower = null;
    }
    title.textContent = s.phase === "done" ? "Terminé !" : `Tir ${s.shot}/${s.shots}${s.phase === "aim" ? " · Tire dans le vert !" : ""}`;
    const fired = firedShot === s.shot;
    for (const b of buttons) b.disabled = s.phase !== "aim" || fired;

    // Ce que montre le but : mon tir (manette, écran individuel), ou le premier but marqué (télé).
    const mine = ctx.me && s.results ? s.results[ctx.me] : undefined;
    const shown = mine ?? (s.results ? Object.values(s.results).find((r) => r.outcome === "but") ?? Object.values(s.results)[0] : undefined);
    if (s.phase === "result" && shown) {
      place(shown.dir, shown.keeper, shown.outcome);
      if (scene3d && !ctx.me && s.results) {
        const who = Object.entries(s.results).find(([, r]) => r === shown)?.[0];
        if (who) scene3d.setShooter(ctx.avatarData?.(who) ?? null);
      }
      scene3d?.show(shown.dir, shown.keeper, shown.outcome);
      say.textContent = mine ? OUTCOME[mine.outcome] : "";
    } else {
      place(null, null, null);
      scene3d?.reset();
      say.textContent = s.phase === "aim" ? (fired ? "Tir parti !" : "") : "";
    }
    scene.classList.toggle("is-goal", s.phase === "result" && shown?.outcome === "but");

    clear(results);
    if (s.phase === "result" && s.results) {
      for (const p of ctx.players) {
        const r = s.results[p.id];
        if (r) results.append(h("li", { style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(p.id, 26), h("strong", { text: OUTCOME[r.outcome] })));
      }
    } else if (s.phase === "aim" && ctx.layout !== "pad") {
      for (const id of s.shot_done) results.append(h("li", {}, ctx.avatar(id, 26), h("strong", { text: "a tiré" })));
    }
    if (ctx.layout !== "pad")
      scoreLanes(lanes, ctx.players, { score: (id) => s.goals[id] ?? 0, max: s.shots, me: ctx.me, avatar: ctx.avatar, label: (id, n) => `${(s.history[id] ?? []).map((o) => MARK[o]).join("")} ${n}` });
  }

  return {
    update(next) {
      state = next as PenaltyState;
      render();
    },
    destroy() {
      gone = true;
      scene3d?.destroy();
      stop();
      window.removeEventListener("keydown", onKey);
    },
  };
}
