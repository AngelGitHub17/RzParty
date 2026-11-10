import {
  ILE_BONUS_NAMES,
  ILE_ERUPTION_BACK,
  ILE_CELL_INFO,
  ILE_GATES,
  ILE_SUMMIT,
  ILE_VOLCANO,
  PLAYER_COLORS,
  ileLayout,
  type IleState,
  type PublicPlayer,
  type RoomSnapshot,
} from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { sendAction, with3D } from "./modeKit.ts";
import type { IleScene } from "../three/ileScene.ts";

const NS = "http://www.w3.org/2000/svg";
const LAYOUT = ileLayout();
const GATE_ICONS: Record<string, string> = { liane: "🌿", dragon: "🐉", caisses: "📦", volcan: "🌋", boule: "⚙️", final: "🗿" };
const DIE_CLASS: Record<number, string> = { 6: "is-gold", 3: "is-silver", 2: "is-bronze" };
/** Volcan : petite piste à part, en haut à droite. */
const VOLCANO_POS = ILE_VOLCANO.map((_, i) => ({ x: 790 + (i % 5) * 42, y: 40 + Math.floor(i / 5) * 46 }));

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Mode « Île aux défis » : l'île en spirale, ses 6 défis, le volcan, les pions et le tour en cours. */
export class IleView {
  private readonly el: HTMLElement;
  private readonly map = el("svg", { viewBox: "0 0 1000 720", class: "ile__map", role: "img", "aria-label": "L'île et la position des joueurs" });
  private readonly cellLayer = el("g", {});
  private readonly gateLayer = el("g", {});
  private readonly pawnLayer = el("g", {});
  private readonly banner = h("div", { class: "ile__banner", attrs: { "aria-live": "polite" } });
  private readonly dice = h("div", { class: "ile__dice" });
  private readonly controls = h("div", { class: "ile__controls" });
  private readonly side = h("div", { class: "ile__side" });
  private readonly pawns = new Map<string, SVGGElement>();
  private cellsDrawn = "";
  private room: RoomSnapshot | null = null;
  private stop: () => void;
  private scene: IleScene | null = null;
  private readonly board: HTMLElement = h("div", { class: "ile__board" }, this.map);
  private destroyed = false;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.drawBackground();
    this.map.append(this.cellLayer, this.gateLayer, this.pawnLayer);
    this.el = h(
      "section",
      { class: `ile ile--${layout}` },
      h("div", { class: "ile__main" }, this.banner, this.board, h("div", { class: "ile__bar" }, this.dice, this.controls)),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.side),
    );
    root.append(this.el);
    this.stop = everyFrame(() => this.tick());
    with3D(this.board, () => import("../three/ileScene.ts"), ({ IleScene }, host) => {
      if (this.destroyed) return false;
      this.scene = new IleScene(host, layout === "tv");
      if (this.room?.game?.ile) this.scene.update(this.room.game.ile, this.room.players);
      return true;
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.scene?.destroy();
    this.stop();
    this.el.remove();
  }

  private drawBackground(): void {
    const defs = el("defs", {});
    defs.innerHTML = `
      <radialGradient id="ile-sea" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#7fd3ff"/><stop offset="1" stop-color="#2f7bef"/></radialGradient>
      <radialGradient id="ile-land" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#c9b28a"/><stop offset=".35" stop-color="#8cc63f"/><stop offset=".85" stop-color="#5aa832"/><stop offset="1" stop-color="#f2e0b6"/></radialGradient>`;
    this.map.append(
      defs,
      el("rect", { x: 0, y: 0, width: 1000, height: 720, fill: "url(#ile-sea)" }),
      el("ellipse", { cx: 500, cy: 372, rx: 492, ry: 352, fill: "#f2e0b6" }),
      el("ellipse", { cx: 500, cy: 368, rx: 470, ry: 332, fill: "url(#ile-land)" }),
      el("ellipse", { cx: 500, cy: 368, rx: 150, ry: 105, fill: "#a7926c", opacity: 0.55 }),
    );
    const path = el("polyline", { points: LAYOUT.map((p) => `${p.x},${p.y}`).join(" "), fill: "none", stroke: "#fff8", "stroke-width": 12, "stroke-linecap": "round", "stroke-linejoin": "round" });
    this.map.append(path);
    // Le volcan.
    const v = el("g", { class: "ile__volcano" });
    v.append(
      el("rect", { x: 760, y: 8, width: 232, height: 132, rx: 18, fill: "#3b1f1a", opacity: 0.88 }),
      el("text", { x: 876, y: 132, "text-anchor": "middle", class: "ile__volcano-title" }, "🌋 Volcan"),
    );
    VOLCANO_POS.forEach((p, i) => {
      const t = ILE_VOLCANO[i]!;
      v.append(el("circle", { cx: p.x, cy: p.y, r: 15, fill: t === "plus4" ? "#2F7BEF" : t === "cri" ? "#F7C21B" : t === "sortie" ? "#7bcb3a" : "#6b3a2e", stroke: "#ffb199", "stroke-width": 2 }));
      v.append(el("text", { x: p.x, y: p.y + 5, "text-anchor": "middle", class: "ile__vtext" }, t === "plus4" ? "+4" : t === "cri" ? "!" : t === "sortie" ? "→" : ""));
    });
    this.map.append(v);
  }

  private drawCells(s: IleState): void {
    const key = `${s.cells.join(",")}|${s.eruption}|${s.dragonBroken}`;
    if (key === this.cellsDrawn) return;
    this.cellsDrawn = key;
    this.cellLayer.replaceChildren();
    this.gateLayer.replaceChildren();
    s.cells.forEach((type, i) => {
      const p = LAYOUT[i]!;
      const erupted = s.eruption > 0 && type !== "vide" && type !== "depart";
      const info = erupted ? { ...ILE_CELL_INFO.moins4, symbol: `−${ILE_ERUPTION_BACK * s.eruption}` } : ILE_CELL_INFO[type];
      const g = el("g", { class: `ile__cell${erupted ? " is-erupted" : ""}` });
      const title = el("title", {}, `Case ${i} · ${info.label} : ${info.help}`);
      g.append(title, el("circle", { cx: p.x, cy: p.y, r: 17, fill: info.color, stroke: "#fff", "stroke-width": 3 }));
      if (info.symbol) g.append(el("text", { x: p.x, y: p.y + 5, "text-anchor": "middle", class: "ile__symbol" }, info.symbol));
      this.cellLayer.append(g);
    });
    // Les défis : une barrière entre deux cases, et la statue au sommet.
    ILE_GATES.forEach((gate, i) => {
      const a = LAYOUT[gate.after]!;
      const b = LAYOUT[gate.after + 1]!;
      // Le défi est posé à côté du chemin, côté extérieur, relié par un trait entre les deux cases.
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      // Du côté le plus dégagé (loin des autres cases).
      const room = (sx: number, sy: number) => Math.min(...LAYOUT.map((p) => Math.hypot(p.x - (cx + sx * 30), p.y - (cy + sy * 30))));
      if (room(-nx, -ny) > room(nx, ny)) (nx = -nx), (ny = -ny);
      const mx = cx + nx * 30;
      const my = cy + ny * 30;
      const open = gate.kind === "dragon" && s.dragonBroken;
      const g = el("g", { class: `ile__gate${open ? " is-open" : ""}${gate.kind === "final" ? " is-final" : ""}` });
      g.append(el("title", {}, `Défi ${i + 1} · ${gate.label} : ${gate.help}`));
      if (gate.kind === "final") {
        g.append(el("circle", { cx: b.x, cy: b.y, r: 30, fill: "#ffc83d", stroke: "#fff", "stroke-width": 4 }), el("text", { x: b.x, y: b.y + 11, "text-anchor": "middle", class: "ile__gate-icon is-big" }, "🗿"));
      } else {
        g.append(
          el("line", { x1: cx - nx * 8, y1: cy - ny * 8, x2: cx + nx * 14, y2: cy + ny * 14, stroke: open ? "#2db866" : "#1d2340", "stroke-width": 6, "stroke-linecap": "round" }),
          el("line", { x1: cx - ny * 14, y1: cy + nx * 14, x2: cx + ny * 14, y2: cy - nx * 14, stroke: open ? "#2db86699" : "#b3261e", "stroke-width": 7, "stroke-linecap": "round" }),
          el("circle", { cx: mx, cy: my, r: 16, fill: open ? "#bfe9c9" : "#fff", stroke: open ? "#2db866" : "#1d2340", "stroke-width": 3 }),
          el("text", { x: mx, y: my + 6, "text-anchor": "middle", class: "ile__gate-icon" }, open ? "💥" : GATE_ICONS[gate.kind] ?? "!"),
          el("text", { x: mx + 13, y: my - 11, class: "ile__gate-n" }, String(i + 1)),
        );
      }
      this.gateLayer.append(g);
    });
  }

  private drawPawns(s: IleState, players: PublicPlayer[]): void {
    const spots = new Map<string, string[]>();
    for (const id of s.order) {
      const p = s.pawns[id];
      if (!p) continue;
      const key = p.volcano !== null ? `v${p.volcano}` : `c${p.cell}`;
      spots.set(key, [...(spots.get(key) ?? []), id]);
    }
    for (const [id, pawn] of this.pawns) if (!s.pawns[id]) (pawn.remove(), this.pawns.delete(id));
    for (const [key, ids] of spots) {
      ids.forEach((id, i) => {
        const player = players.find((x) => x.id === id);
        if (!player) return;
        let pawn = this.pawns.get(id);
        if (!pawn) {
          pawn = el("g", { class: "ile__pawn" });
          pawn.append(el("circle", { r: 16, fill: PLAYER_COLORS[player.color]?.hex ?? "#fff", stroke: "#fff", "stroke-width": 3 }));
          const face = playerAvatar(player, { size: 28 });
          face.setAttribute("x", "-14");
          face.setAttribute("y", "-17");
          face.setAttribute("width", "28");
          face.setAttribute("height", "30");
          pawn.append(face);
          this.pawnLayer.append(pawn);
          this.pawns.set(id, pawn);
        }
        const base = key.startsWith("v") ? VOLCANO_POS[Number(key.slice(1))]! : LAYOUT[Math.min(Number(key.slice(1)), ILE_SUMMIT)]!;
        const dx = (i - (ids.length - 1) / 2) * 18;
        pawn.classList.toggle("is-turn", s.turn?.playerId === id);
        pawn.setAttribute("transform", `translate(${base.x + dx} ${base.y - 24})`);
      });
    }
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const s = room.game?.ile;
    if (!s) return;
    if (this.scene) this.scene.update(s, room.players);
    else {
      this.drawCells(s);
      this.drawPawns(s, room.players);
    }
    this.renderTurn(s, room.players);
    this.renderSide(s, room.players);
  }

  private renderTurn(s: IleState, players: PublicPlayer[]): void {
    const t = s.turn;
    const who = t ? players.find((p) => p.id === t.playerId) : undefined;
    clear(this.banner);
    if (s.eruption > 0) this.banner.append(h("span", { class: "ile__eruption", text: `🌋 Éruption${s.eruption > 1 ? ` ×${s.eruption}` : ""} : −${ILE_ERUPTION_BACK * s.eruption} jusqu'à la fin du tour` }));
    if (who && t) this.banner.append(playerAvatar(who, { size: 30 }), h("strong", { text: who.name }), h("span", { text: ` ${t.message}` }));
    else this.banner.append(h("span", { text: s.round ? "Mini-jeu : il décide de l'ordre et des dés bonus !" : "Cap sur le sommet de l'île !" }));
    clear(this.dice);
    if (t?.roll) {
      this.dice.append(h("span", { class: "ile__die", text: String(t.roll.std) }));
      if (t.roll.bonus !== null) this.dice.append(h("span", { class: `ile__die ${DIE_CLASS[t.roll.bonusMax ?? 0] ?? ""}`, text: String(t.roll.bonus) }));
      if (t.roll.extra !== null) this.dice.append(h("span", { class: "ile__die is-extra", text: String(t.roll.extra) }));
      this.dice.append(h("strong", { class: "ile__total", text: `= ${t.roll.total}` }));
    }
    if (t?.challenge && t.challenge.value !== null && !t.roll) {
      this.dice.append(h("span", { class: "ile__die", text: String(t.challenge.value) }));
      if (t.challenge.need !== null) this.dice.append(h("strong", { class: "ile__total", text: `${t.challenge.ok === null ? "…" : t.challenge.ok ? "✔" : "✘"} il fallait ${t.challenge.need}` }));
    }
    clear(this.controls);
    const mine = this.layout !== "tv" && this.meId !== null && t?.playerId === this.meId;
    if (!mine || !t) return;
    if (t.phase === "gate") {
      this.controls.append(
        h("button", { class: "btn btn--go", attrs: { type: "button" }, text: "Lancer le dé du défi", on: { click: () => void sendAction({ type: "roll" }) } }),
        h("span", { class: "muted", attrs: { "data-deadline": "" } }),
      );
    } else if (t.phase === "roll") {
      const bonus = s.bonus[this.meId!];
      this.controls.append(
        h("button", {
          class: "btn btn--go",
          attrs: { type: "button" },
          text: bonus ? `Lancer les dés (+ ${ILE_BONUS_NAMES[bonus]})` : "Lancer le dé",
          on: { click: () => void sendAction({ type: "roll" }) },
        }),
        h("span", { class: "muted", attrs: { "data-deadline": "" } }),
      );
    } else if (t.choose?.kind === "chemin") {
      t.choose.options.forEach((label, option) =>
        this.controls.append(h("button", { class: "btn btn--go", attrs: { type: "button" }, text: `${option ? "🛢️" : "📦"} ${label}`, on: { click: () => void sendAction({ type: "path", option }) } })),
      );
      this.controls.append(h("span", { class: "muted", attrs: { "data-deadline": "" } }));
    } else if (t.choose?.kind === "duel") {
      for (const id of t.choose.options) {
        const p = players.find((x) => x.id === id);
        if (!p) continue;
        this.controls.append(h("button", { class: "btn btn--ghost", attrs: { type: "button" }, on: { click: () => void sendAction({ type: "duel", target: id }) } }, playerAvatar(p, { size: 24 }), h("span", { text: ` ${p.name}` })));
      }
      this.controls.append(h("span", { class: "muted", attrs: { "data-deadline": "" } }));
    }
  }

  private renderSide(s: IleState, players: PublicPlayer[]): void {
    if (this.layout === "pad") return;
    clear(this.side);
    this.side.append(h("h3", { class: "ile__title", text: `Tour ${Math.max(1, s.round)} · ordre de passage` }));
    const list = h("ol", { class: "ile__order" });
    for (const id of s.order) {
      const p = players.find((x) => x.id === id);
      const pawn = s.pawns[id];
      if (!p || !pawn) continue;
      const bonus = s.bonus[id];
      const where = pawn.volcano !== null ? "dans le volcan" : pawn.cell >= ILE_SUMMIT ? "au sommet !" : `case ${pawn.cell}/${ILE_SUMMIT - 1}`;
      list.append(
        h(
          "li",
          { class: `ile__row${s.turn?.playerId === id ? " is-turn" : ""}${id === this.meId ? " is-me" : ""}` },
          playerAvatar(p, { size: 28 }),
          h("span", { class: "ile__name", text: p.name }),
          bonus ? h("span", { class: `ile__badge ${DIE_CLASS[bonus] ?? ""}`, attrs: { title: ILE_BONUS_NAMES[bonus] ?? "" }, text: `1-${bonus}` }) : null,
          h("span", { class: "muted", text: where }),
        ),
      );
    }
    this.side.append(list);
    const gates = h("ol", { class: "ile__gates" });
    ILE_GATES.forEach((g, i) => {
      const extra = g.kind === "dragon" ? (s.dragonBroken ? " · brisé" : " · 4+") : g.kind === "volcan" ? " · 3+" : g.kind === "boule" ? ` · ${this.meId && s.spikeNeed[this.meId] ? s.spikeNeed[this.meId] : 5}+` : g.kind === "final" ? " · 6+" : "";
      gates.append(h("li", { attrs: { title: g.help } }, h("span", { text: GATE_ICONS[g.kind] ?? "" }), h("span", { text: ` ${i + 1}. ${g.label}${extra}` })));
    });
    this.side.append(h("h3", { class: "ile__title", text: "Les défis" }), gates);
  }

  private tick(): void {
    const t = this.room?.game?.ile?.turn;
    const el = this.controls.querySelector<HTMLElement>("[data-deadline]");
    if (el && t?.endsAt) el.textContent = `Automatique dans ${Math.max(0, Math.ceil((t.endsAt - serverNow()) / 1000))} s`;
  }
}
