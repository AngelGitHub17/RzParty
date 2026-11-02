import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { LABY_DURATION_MS, OPEN, type Dir, type LabyState } from "./types.ts";

const NS = "http://www.w3.org/2000/svg";
const CELL = 10;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const KEYS: Record<string, Dir> = {
  ArrowUp: "haut",
  ArrowDown: "bas",
  ArrowLeft: "gauche",
  ArrowRight: "droite",
  z: "haut",
  w: "haut",
  s: "bas",
  q: "gauche",
  a: "gauche",
  d: "droite",
};

/**
 * « Labyrinthe » : le même labyrinthe pour tous, chacun guide son pion.
 * Flèches à l'écran (téléphone), clavier (flèches ou ZQSD) ou glisser du doigt.
 */
export function labyrintheView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: LabyState | null = null;
  let builtFor = "";

  const bar = timeBar(ctx.serverNow);
  const board = el("svg", { class: "laby__board", role: "img", "aria-label": "Labyrinthe" });
  const tokens = el("g", {});
  const status = h("p", { class: "laby__status", attrs: { "aria-live": "polite" } });
  const podium = h("ol", { class: "laby__arrived" });
  const tokenEls = new Map<string, SVGGElement>();

  const send = (dir: Dir) => {
    if (!state || state.finished || (ctx.me && state.arrived.includes(ctx.me))) return;
    ctx.send({ dir });
  };
  const arrow = (dir: Dir, label: string) =>
    h("button", {
      class: `laby__key laby__key--${dir}`,
      attrs: { type: "button", "aria-label": dir },
      text: label,
      on: {
        pointerdown: (e) => {
          e.preventDefault();
          send(dir);
        },
      },
    });
  const pad = interactive ? h("div", { class: "laby__pad" }, arrow("haut", "▲"), arrow("gauche", "◀"), arrow("droite", "▶"), arrow("bas", "▼")) : null;

  const onKey = (e: KeyboardEvent) => {
    const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
    if (!dir || !interactive) return;
    e.preventDefault();
    send(dir);
  };
  window.addEventListener("keydown", onKey);

  // Glisser du doigt sur le labyrinthe.
  let touchStart: { x: number; y: number } | null = null;
  board.addEventListener("pointerdown", (e) => (touchStart = { x: e.clientX, y: e.clientY }));
  board.addEventListener("pointerup", (e) => {
    if (!touchStart || !interactive) return;
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    send(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "droite" : "gauche") : dy > 0 ? "bas" : "haut");
  });

  root.append(
    h(
      "div",
      { class: `mg laby laby--${ctx.layout}` },
      bar.el,
      status,
      h("div", { class: "laby__stage" }, board, pad),
      ctx.layout === "pad" ? null : podium,
    ),
  );

  function build(s: LabyState): void {
    const key = s.cells.join(",");
    if (key === builtFor) return;
    builtFor = key;
    while (board.firstChild) board.removeChild(board.firstChild);
    const size = s.size * CELL;
    board.setAttribute("viewBox", `-2 -2 ${size + 4} ${size + 4}`);
    board.append(el("rect", { x: 0, y: 0, width: size, height: size, rx: 2, class: "laby__floor" }));
    board.append(el("rect", { x: 0.8, y: 0.8, width: CELL - 1.6, height: CELL - 1.6, rx: 2, class: "laby__start" }));
    const ex = s.exit.x * CELL, ey = s.exit.y * CELL;
    board.append(el("rect", { x: ex + 0.8, y: ey + 0.8, width: CELL - 1.6, height: CELL - 1.6, rx: 2, class: "laby__exit" }));
    const flag = el("text", { x: ex + CELL / 2, y: ey + CELL / 2 + 2.6, class: "laby__flag", "text-anchor": "middle" });
    flag.textContent = "★";
    board.append(flag);
    const walls = el("path", { class: "laby__walls", d: "" });
    let d = `M0 0H${size}V${size}H0Z`;
    for (let y = 0; y < s.size; y++) {
      for (let x = 0; x < s.size; x++) {
        const c = s.cells[y * s.size + x]!;
        if (!(c & OPEN.droite) && x < s.size - 1) d += `M${(x + 1) * CELL} ${y * CELL}v${CELL}`;
        if (!(c & OPEN.bas) && y < s.size - 1) d += `M${x * CELL} ${(y + 1) * CELL}h${CELL}`;
      }
    }
    walls.setAttribute("d", d);
    board.append(walls, tokens);
    tokenEls.clear();
    clear(tokens as unknown as Element);
  }

  function render(): void {
    if (!state) return;
    const s = state;
    bar.set(s.endsAt - LABY_DURATION_MS, s.endsAt);
    build(s);
    // Mon pion par-dessus les autres.
    const order = [...ctx.players].sort((a, b) => Number(a.id === ctx.me) - Number(b.id === ctx.me));
    for (const p of order) {
      const pos = s.positions[p.id];
      if (!pos) continue;
      let g = tokenEls.get(p.id);
      if (!g) {
        g = el("g", { class: `laby__token${p.id === ctx.me ? " is-me" : ""}` });
        const mine = p.id === ctx.me;
        g.append(el("circle", { r: mine ? 3.6 : 2.6, fill: PLAYER_COLORS[p.color]?.hex ?? "#fff", stroke: "#1e2a4a", "stroke-width": mine ? 1.2 : 0.8 }));
        tokens.append(g);
        tokenEls.set(p.id, g);
      }
      // Petit décalage pour voir plusieurs pions sur la même case.
      const i = ctx.players.indexOf(p);
      const off = p.id === ctx.me || ctx.layout === "pad" ? [0, 0] : [Math.cos(i * 2.4) * 1.6, Math.sin(i * 2.4) * 1.6];
      g.style.transform = `translate(${pos.x * CELL + CELL / 2 + off[0]!}px, ${pos.y * CELL + CELL / 2 + off[1]!}px)`;
      g.style.opacity = ctx.layout === "pad" && p.id !== ctx.me ? "0.35" : "1";
    }
    if (ctx.me && s.arrived.includes(ctx.me)) {
      const rank = s.arrived.indexOf(ctx.me) + 1;
      status.textContent = `Sorti ! ${rank === 1 ? "1er" : `${rank}e`}`;
    } else if (s.finished) status.textContent = "Temps écoulé !";
    else status.textContent = interactive ? "Rejoins l'étoile ★" : `${s.arrived.length} sorti${s.arrived.length > 1 ? "s" : ""} sur ${ctx.players.length}`;

    if (ctx.layout === "pad") return;
    clear(podium);
    s.arrived.forEach((id, i) => {
      const p = ctx.players.find((x) => x.id === id);
      if (p) podium.append(h("li", {}, h("strong", { text: i === 0 ? "1er" : `${i + 1}e` }), ctx.avatar(id, 28), h("span", { text: p.name })));
    });
  }

  return {
    update(next) {
      state = next as LabyState;
      render();
    },
    destroy() {
      bar.destroy();
      window.removeEventListener("keydown", onKey);
    },
  };
}
