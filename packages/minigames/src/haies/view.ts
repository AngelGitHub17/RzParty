import "../timing.css";
import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, everyFrame, h, mount3D, svg } from "../kit.ts";
import { castPlayers } from "../three/players.ts";
import type { HaiesScene } from "./scene3d.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { localStart } from "../timing.ts";
import { JUMP_MS, RACE_LENGTH, STEP_MS, simulateRun, type HaiesState } from "./types.ts";

const NS = "http://www.w3.org/2000/svg";
const PX = 26; // pixels par mètre dans la vue rapprochée

/** « Course de haies » : vue rapprochée de mon coureur + couloirs de tout le monde. */
export function haiesView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: HaiesState | null = null;
  let start = 0;
  let started = false;
  let mine: number[] = [];

  const title = h("p", { class: "tm__title", attrs: { "aria-live": "polite" } });
  const close = svg(`<svg viewBox="0 0 640 200" class="hai__close" aria-hidden="true">
    <rect width="640" height="200" fill="#cdebff"/>
    <rect y="150" width="640" height="50" fill="#e07a4f"/>
    <g class="hai__world"></g>
    <g class="hai__me" transform="translate(160 150)"><ellipse cy="4" rx="16" ry="4" fill="#0002"/><g class="hai__body"></g></g>
    <text class="hai__meters" x="620" y="30" text-anchor="end"></text>
  </svg>`);
  const world = close.querySelector<SVGGElement>(".hai__world")!;
  const body = close.querySelector<SVGGElement>(".hai__body")!;
  const meters = close.querySelector<SVGTextElement>(".hai__meters")!;
  const lanesSvg = svg(`<svg viewBox="0 0 640 ${Math.max(2, ctx.players.length) * 34 + 6}" class="hai__lanes" aria-hidden="true"></svg>`);
  const button = h("button", { class: "tm__btn", attrs: { type: "button" }, text: "SAUTER", on: { pointerdown: (e) => (e.preventDefault(), jump()) } });
  const results = h("ul", { class: "tm__results" });
  // En 3D quand c'est possible : une seule scène (ma course de près + tous les couloirs).
  const box = h("div", { class: "mg3d-box hai__box" });
  let scene: HaiesScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ HaiesScene }, host) => {
    if (gone) return false;
    scene = new HaiesScene(host, castPlayers(ctx), interactive ? ctx.me : null);
    root.querySelector(".hai")?.classList.add("is-3d");
    return true;
  });
  root.append(
    h(
      "div",
      { class: `mg tm hai hai--${ctx.layout}` },
      title,
      h("div", { class: "tm__stage hai__box-wrap" }, box),
      interactive ? h("div", { class: "tm__stage hai__close-box" }, close) : null,
      ctx.layout === "pad" ? null : h("div", { class: "tm__stage hai__lanes-box" }, lanesSvg),
      interactive ? button : null,
      results,
    ),
  );
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter" || e.key === "ArrowUp") && interactive) {
      e.preventDefault();
      if (!e.repeat) jump();
    }
  };
  window.addEventListener("keydown", onKey);

  const myColor = PLAYER_COLORS[ctx.players.find((p) => p.id === ctx.me)?.color ?? 0]?.hex ?? "#2db866";
  body.innerHTML = runnerMarkup(myColor);

  function jump(): void {
    const s = state;
    if (!s || s.phase !== "run" || !ctx.me || s.finished[ctx.me]) return;
    const t = Math.max(0, Math.round((performance.now() - start) / STEP_MS) * STEP_MS);
    const run = simulateRun(s.hurdles, mine, t);
    if (run.air || run.finishedAt !== null || (mine.length && mine.at(-1)! >= t)) return;
    mine.push(t);
    ctx.send({ jumps: [...mine] });
  }

  // Couloirs : un trait par joueur, les haies, et le coureur.
  const laneDots = new Map<string, SVGGElement>();
  function buildLanes(s: HaiesState): void {
    clear(lanesSvg);
    ctx.players.forEach((p, i) => {
      const y = 6 + i * 34;
      const g = document.createElementNS(NS, "g");
      g.innerHTML = `<rect x="0" y="${y}" width="640" height="30" rx="6" fill="${i % 2 ? "#e9895f" : "#e07a4f"}"/>
        ${s.hurdles.map((hx) => `<rect x="${(30 + (hx / RACE_LENGTH) * 590).toFixed(1)}" y="${y + 6}" width="3" height="18" fill="#fff"/>`).join("")}
        <rect x="620" y="${y}" width="4" height="30" fill="#1e2a4a"/>`;
      const dot = document.createElementNS(NS, "g");
      dot.innerHTML = `<circle r="10" fill="${PLAYER_COLORS[p.color]?.hex ?? "#fff"}" stroke="#fff" stroke-width="3"/>`;
      g.append(dot);
      lanesSvg.append(g);
      laneDots.set(p.id, dot);
      dot.dataset.y = String(y + 15);
    });
  }

  const stop = everyFrame(() => {
    const s = state;
    if (!s) return;
    const t = s.phase === "run" || s.phase === "result" ? performance.now() - start : 0;
    if (scene) {
      scene.draw(s.hurdles, (id) => (id === ctx.me ? mine : (s.jumps[id] ?? [])), t);
      return;
    }
    if (interactive && ctx.me) {
      const run = simulateRun(s.hurdles, mine, t);
      // Le monde défile ; le coureur saute en arc.
      clear(world);
      const from = run.x - 160 / PX;
      for (const [i, hx] of s.hurdles.entries()) {
        const x = (hx - from) * PX;
        if (x < -30 || x > 680) continue;
        const knocked = run.hit.includes(i);
        const g = document.createElementNS(NS, "g");
        g.setAttribute("transform", `translate(${x} 150) ${knocked ? "rotate(70)" : ""}`);
        g.innerHTML = `<rect x="-3" y="-44" width="6" height="44" fill="#fff"/><rect x="-14" y="-48" width="28" height="9" rx="3" fill="#f0483e"/>`;
        world.append(g);
      }
      const finishX = (RACE_LENGTH - from) * PX;
      if (finishX < 680) {
        const line = document.createElementNS(NS, "rect");
        line.setAttribute("x", String(finishX));
        line.setAttribute("y", "40");
        line.setAttribute("width", "8");
        line.setAttribute("height", "110");
        line.setAttribute("fill", "#1e2a4a");
        world.append(line);
      }
      const last = mine.filter((j) => j <= t).at(-1);
      const air = last !== undefined && t - last < JUMP_MS && run.air;
      const lift = air ? Math.sin(((t - last!) / JUMP_MS) * Math.PI) * 60 : 0;
      body.setAttribute("transform", `translate(0 ${-lift})`);
      meters.textContent = run.finishedAt !== null ? `Arrivé : ${(run.finishedAt / 1000).toFixed(2)} s` : `${Math.floor(run.x)} / ${RACE_LENGTH} m`;
    }
    if (ctx.layout !== "pad") {
      for (const p of ctx.players) {
        const dot = laneDots.get(p.id);
        if (!dot) continue;
        const run = simulateRun(s.hurdles, p.id === ctx.me ? mine : s.jumps[p.id] ?? [], t);
        dot.setAttribute("transform", `translate(${30 + (run.x / RACE_LENGTH) * 590} ${Number(dot.dataset.y) - (run.air ? 6 : 0)})`);
      }
    }
  });

  function render(): void {
    const s = state;
    if (!s) return;
    if (!laneDots.size) buildLanes(s);
    if (s.phase === "run" && !started) {
      started = true;
      start = localStart(s.startedAt, ctx.serverNow);
    }
    title.textContent = s.phase === "ready" ? "À vos marques…" : s.phase === "run" ? "Saute les haies !" : "Arrivée !";
    button.disabled = s.phase !== "run" || Boolean(ctx.me && s.finished[ctx.me]);
    clear(results);
    const ranked = ctx.players.filter((p) => s.finished[p.id]).sort((a, b) => (s.finished[a.id]!.time ?? 1e9) - (s.finished[b.id]!.time ?? 1e9));
    ranked.forEach((p, i) => {
      const r = s.finished[p.id]!;
      results.append(
        h("li", { class: i === 0 && r.time !== null ? "is-best" : "", style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(p.id, 26), h("strong", { text: r.time === null ? "Abandon" : `${(r.time / 1000).toFixed(2)} s${r.hits ? ` · ${r.hits} haie${r.hits > 1 ? "s" : ""}` : ""}` })),
      );
    });
  }

  return {
    update(next) {
      state = next as HaiesState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      stop();
      window.removeEventListener("keydown", onKey);
    },
  };
}

function runnerMarkup(color: string): string {
  return `<rect x="-11" y="-34" width="22" height="26" rx="10" fill="${color}"/>
    <circle cy="-44" r="11" fill="#ffd9b8"/><circle cx="4" cy="-46" r="2.5" fill="#1e2a4a"/>
    <path d="M-6 -10 L-12 0 M6 -10 L12 0" stroke="#1e2a4a" stroke-width="5" stroke-linecap="round"/>`;
}
