import "../timing.css";
import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { everyFrame, h, mount3D, scoreLanes, timeBar } from "../kit.ts";
import type { CadeauxScene } from "./scene3d.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { FIELD, GIFTS_MS, giftCenter, type CadeauxState, type Tower } from "./types.ts";

const NS = "http://www.w3.org/2000/svg";
const BLOCK_H = 20;
const H = 220;
const FLOOR = 206;
const VISIBLE = 9;
const RIBBONS = ["#f0483e", "#3f7fe0", "#2db866", "#9b59d0", "#ff8a1f", "#18bdbd"];

/** Dessine une tour (et son cadeau qui se balance) dans un SVG de 100 × 220 unités. */
function drawTower(svgEl: SVGSVGElement, tower: Tower, swingT: number | null, color: string): void {
  const n = tower.blocks.length;
  const shift = Math.max(0, n - VISIBLE + 1) * BLOCK_H;
  let out = `<rect width="${FIELD}" height="${H}" fill="#fff7e8"/><rect y="${FLOOR}" width="${FIELD}" height="${H - FLOOR}" fill="${color}"/>`;
  tower.blocks.forEach(([l, r], i) => {
    const y = FLOOR - (i + 1) * BLOCK_H + shift;
    if (y < -BLOCK_H) return;
    const fill = i === 0 ? "#56627f" : RIBBONS[i % RIBBONS.length]!;
    out += `<rect x="${l}" y="${y}" width="${r - l}" height="${BLOCK_H - 2}" rx="2" fill="${fill}"/>`;
    if (i > 0) out += `<rect x="${(l + r) / 2 - 2}" y="${y}" width="4" height="${BLOCK_H - 2}" fill="#ffffffcc"/>`;
  });
  if (swingT !== null && !tower.done) {
    const [l, r] = tower.blocks.at(-1)!;
    const w = r - l;
    const c = giftCenter(tower.gift, swingT);
    const y = FLOOR - (n + 2) * BLOCK_H + shift;
    out += `<path d="M${FIELD / 2} 0 L${c} ${y}" stroke="#56627f" stroke-width="0.8"/>`;
    out += `<rect x="${c - w / 2}" y="${y}" width="${w}" height="${BLOCK_H - 2}" rx="2" fill="${RIBBONS[n % RIBBONS.length]}"/><rect x="${c - 2}" y="${y}" width="4" height="${BLOCK_H - 2}" fill="#ffffffcc"/>`;
  }
  if (tower.fell) out += `<text x="50" y="40" text-anchor="middle" font-size="13" font-weight="800" fill="#f0483e">Tombé !</text>`;
  svgEl.innerHTML = out;
}

/** « Tour de cadeaux » : lâcher chaque cadeau au-dessus de la pile. */
export function cadeauxView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: CadeauxState | null = null;
  const bar = timeBar(ctx.serverNow);
  const mine = h("p", { class: "mole__mine" });
  const towers = new Map<string, SVGSVGElement>();
  const grid = h("div", { class: "gift__grid" });
  const shown = ctx.layout === "pad" && ctx.me ? ctx.players.filter((p) => p.id === ctx.me) : ctx.players;
  for (const p of shown) {
    const s = document.createElementNS(NS, "svg") as SVGSVGElement;
    s.setAttribute("viewBox", `0 0 ${FIELD} ${H}`);
    s.setAttribute("class", "gift__tower");
    towers.set(p.id, s);
    grid.append(h("figure", { class: `gift__col${p.id === ctx.me ? " is-me" : ""}` }, s, h("figcaption", {}, ctx.avatar(p.id, 24), h("span", { text: p.name }))));
  }
  // En 3D quand c'est possible (les tours 2D restent là sinon).
  const box = h("div", { class: "mg3d-box gift__box" }, grid);
  let scene: CadeauxScene | null = null;
  let gone = false;
  mount3D(box, () => import("./scene3d.ts"), ({ CadeauxScene }, host) => {
    if (gone) return false;
    scene = new CadeauxScene(host, shown.map((p) => p.id), new Map(shown.map((p) => [p.id, { name: p.name, color: PLAYER_COLORS[p.color]?.hex ?? "#56627f" }])));
    return true;
  });
  const button = h("button", { class: "tm__btn", attrs: { type: "button" }, text: "LÂCHER", on: { pointerdown: (e) => (e.preventDefault(), release()) } });
  const lanes = h("ol", {});
  root.append(h("div", { class: `mg gift gift--${ctx.layout}` }, bar.el, interactive ? mine : null, box, interactive ? button : null, ctx.layout === "tv" ? lanes : null));
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === "Space" || e.key === "Enter" || e.key === "ArrowDown") && interactive) {
      e.preventDefault();
      if (!e.repeat) release();
    }
  };
  window.addEventListener("keydown", onKey);

  /** Instant local d'apparition du cadeau en cours de chaque joueur. */
  const starts = new Map<string, { gift: number; at: number }>();
  let sentGift = -1;

  function release(): void {
    const s = state;
    const tower = s && ctx.me ? s.towers[ctx.me] : undefined;
    if (!s || !tower || tower.done || sentGift === tower.gift) return;
    const st = starts.get(ctx.me!);
    if (!st || st.gift !== tower.gift) return;
    const t = performance.now() - st.at;
    if (t < 0) return;
    sentGift = tower.gift;
    ctx.send({ gift: tower.gift, t: Math.round(t) });
    // Refusé (réseau trop lent) : on peut retenter.
    const gift = tower.gift;
    setTimeout(() => {
      if (sentGift === gift && state?.towers[ctx.me!]?.gift === gift) sentGift = -1;
    }, 1000);
  }

  const stop = everyFrame(() => {
    const s = state;
    if (!s) return;
    for (const p of shown) {
      const tower = s.towers[p.id];
      const el = towers.get(p.id);
      if (!tower || !el) continue;
      const st = starts.get(p.id);
      const t = st && st.gift === tower.gift ? performance.now() - st.at : null;
      const waiting = p.id === ctx.me && sentGift === tower.gift;
      const swingT = t !== null && t >= 0 && !waiting ? t : null;
      if (scene) scene.draw(p.id, tower, swingT);
      else drawTower(el, tower, swingT, PLAYER_COLORS[p.color]?.hex ?? "#56627f");
    }
  });

  function render(): void {
    const s = state;
    if (!s) return;
    bar.set(s.endsAt - GIFTS_MS, s.endsAt);
    for (const [id, tower] of Object.entries(s.towers)) {
      // Le cadeau suivant apparaît un peu après : son départ peut être dans le futur.
      if (starts.get(id)?.gift !== tower.gift) starts.set(id, { gift: tower.gift, at: performance.now() + (tower.spawnAt - ctx.serverNow()) });
    }
    const me = ctx.me ? s.towers[ctx.me] : undefined;
    if (me) {
      const n = me.blocks.length - 1;
      mine.textContent = `${n} étage${n > 1 ? "s" : ""}${me.perfect ? ` · ${me.perfect} parfait${me.perfect > 1 ? "s" : ""}` : ""}${me.fell ? " · Tombé !" : me.done ? " · Terminé !" : ""}`;
      button.disabled = me.done || sentGift === me.gift;
    }
    if (ctx.layout === "tv") scoreLanes(lanes, ctx.players, { score: (id) => (s.towers[id]?.blocks.length ?? 1) - 1, me: ctx.me, avatar: ctx.avatar, label: (_, n) => String(n) });
  }

  return {
    update(next) {
      state = next as CadeauxState;
      render();
    },
    destroy() {
      gone = true;
      scene?.destroy();
      bar.destroy();
      stop();
      window.removeEventListener("keydown", onKey);
    },
  };
}
