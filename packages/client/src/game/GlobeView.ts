import {
  CARD_INFO, DESTINATIONS, PHOTO_PRICE, PLAYER_COLORS, cardLabel, globeDistances,
  type GlobeSpace, type GlobeState, type PublicPlayer, type RoomSnapshot, type SpaceKind, type TravelCard,
} from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction, with3D } from "./modeKit.ts";
import type { GlobeScene } from "../three/globeScene.ts";

const NS = "http://www.w3.org/2000/svg";
const STEP_MS = 320;

export const ICONS: Record<SpaceKind, string> = {
  depart: "🏁",
  destination: "",
  boutique: "🛍️",
  aeroport: "✈️",
  port: "⚓",
  gare: "🚉",
  boulot: "💼",
  surprise: "❓",
  unvstous: "⚔️",
};
const KIND_NAMES: Record<SpaceKind, string> = {
  depart: "Départ : une carte de transport offerte",
  destination: "Destination",
  boutique: "Boutique : acheter des cartes de transport",
  aeroport: "Aéroport : s'envoler ailleurs (5 pièces)",
  port: "Port : traverser l'océan (5 pièces)",
  gare: "Gare : une carte Train offerte",
  boulot: "Petit boulot : 1 à 10 pièces",
  surprise: "Surprise !",
  unvstous: "1 contre tous : mini-jeu seul contre les autres",
};

/** Continents, très simplifiés (positions sur la carte stylisée 1000 × 560). */
export const CONTINENTS: string[] = [
  "40,90 150,60 330,50 360,110 300,170 250,250 230,320 180,300 140,240 70,200 40,140",
  "300,330 380,330 430,380 400,460 360,530 320,500 310,420",
  "350,20 430,15 420,60 360,70",
  "430,70 520,40 640,50 650,140 600,170 520,160 450,150",
  "400,180 520,170 640,190 670,260 650,330 620,470 560,480 520,380 470,290 400,260",
  "640,50 820,40 980,70 990,170 920,200 860,260 800,300 760,280 700,280 660,200",
  "800,320 860,330 830,360",
  "800,400 900,390 960,430 940,500 860,500 800,470",
  "640,380 670,400 660,450 630,445",
];

function spaceName(map: GlobeSpace[], id: number): string {
  const s = map[id]!;
  if (s.destination !== undefined) return `${DESTINATIONS[s.destination]!.flag} ${DESTINATIONS[s.destination]!.name}`;
  // Le nom de la destination la plus proche aide à se repérer.
  let best = 0;
  let dist = Infinity;
  for (const o of map) {
    if (o.destination === undefined) continue;
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    if (d < dist) (dist = d), (best = o.destination);
  }
  return `${ICONS[s.kind]} près de ${DESTINATIONS[best]!.name}`;
}

/** Mode « Tour du monde » : la carte en réseau, le voyage à thème, la rangée de cartes. */
export class GlobeView {
  private readonly el: HTMLElement;
  private readonly map = document.createElementNS(NS, "svg") as SVGSVGElement;
  private readonly pawnLayer = document.createElementNS(NS, "g");
  private readonly optionLayer = document.createElementNS(NS, "g");
  private readonly hotLayer = document.createElementNS(NS, "g");
  private readonly banner = h("div", { class: "bv-banner globe__banner" });
  private readonly text = h("p", { class: "wheel__result globe__text", attrs: { "aria-live": "polite" } });
  private readonly row = h("div", { class: "globe__row-cards" });
  private readonly controls = h("div", { class: "bv-controls globe__controls" });
  private readonly hot = h("div", { class: "globe__hot" });
  private readonly table = h("div", {});
  private builtMap = false;
  private room: RoomSnapshot | null = null;
  /** Position affichée de chaque pion (pour l'animation de déplacement). */
  private shown = new Map<string, number>();
  private anim: { id: string; path: number[]; start: number } | null = null;
  private shownMove = -1;
  private pawns = new Map<string, SVGGElement>();
  private taxi: { index: number; steps: number } | null = null;
  private stop: () => void;
  private scene: GlobeScene | null = null;
  private destroyed = false;
  private readonly mapBox: HTMLElement = h("div", { class: "globe__map-box" }, this.map);

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.map.setAttribute("viewBox", "0 0 1000 560");
    this.map.setAttribute("class", "globe__map");
    this.map.setAttribute("role", "img");
    this.map.setAttribute("aria-label", "Carte du monde et chemins");
    this.el = h(
      "section",
      { class: `globe globe--${layout}` },
      h("div", { class: "globe__main" }, this.banner, this.mapBox, this.row, this.text),
      h("aside", { class: "bv-side" }, this.hot, this.controls, this.table),
    );
    root.append(this.el);
    this.stop = everyFrame(() => this.tick());
    with3D(this.mapBox, () => import("../three/globeScene.ts"), ({ GlobeScene }, host) => {
      if (this.destroyed) return false;
      this.scene = new GlobeScene(host, layout === "tv", { continents: CONTINENTS, icons: ICONS }, (space) => void sendAction({ type: "move", space }));
      const g = this.room?.game?.globe;
      if (g) this.scene.update(g, this.room!.players, this.mine(g));
      return true;
    });
  }

  private mine(g: GlobeState): boolean {
    return this.layout !== "tv" && g.turn?.playerId === this.meId;
  }

  destroy(): void {
    this.destroyed = true;
    this.scene?.destroy();
    this.stop();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const g = room.game?.globe;
    if (!g) return;
    if (!this.builtMap) this.buildMap(g);
    this.scene?.update(g, room.players, this.mine(g));
    const turn = g.turn;
    if (turn && turn.moveId !== this.shownMove) {
      this.shownMove = turn.moveId;
      if (turn.path.length && this.shown.has(turn.playerId)) this.anim = { id: turn.playerId, path: turn.path, start: performance.now() };
    }
    for (const [id, pos] of Object.entries(g.positions)) if (!this.anim || this.anim.id !== id) this.shown.set(id, pos);
    if (turn?.choice?.type !== "card") this.taxi = null;
    this.renderHot(g);
    this.renderBanner(g, room.players);
    this.renderRow(g);
    this.renderControls(g);
    this.renderOptions(g);
    clear(this.table);
    this.table.append(
      scoreTable(room.players, g.order, (id) => (g.photos[id]?.length ?? 0) * 10000 + (g.coins[id] ?? 0), (id) => `📷 ${g.photos[id]?.length ?? 0} · 🪙 ${g.coins[id] ?? 0}`, { meId: this.meId, highlight: turn?.playerId ?? null }),
    );
  }

  private buildMap(g: GlobeState): void {
    this.builtMap = true;
    const edges: string[] = [];
    for (const s of g.map) for (const n of s.next) if (n > s.id) edges.push(`<line x1="${s.x}" y1="${s.y}" x2="${g.map[n]!.x}" y2="${g.map[n]!.y}"/>`);
    this.map.innerHTML = `<rect width="1000" height="560" fill="#5eb8f2"/>
      ${CONTINENTS.map((c) => `<polygon points="${c}" fill="#9be07a" stroke="#6cbf55" stroke-width="3" stroke-linejoin="round"/>`).join("")}
      <g stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.9">${edges.join("")}</g>
      ${g.map
        .map((s) => {
          const dest = s.destination !== undefined;
          return `<g transform="translate(${s.x} ${s.y})"><title>${dest ? DESTINATIONS[s.destination!]!.name : KIND_NAMES[s.kind]}</title>
            <circle r="${dest ? 17 : 13}" fill="${dest ? "#ffffff" : "#1e2a4a"}" stroke="${dest ? "#1e2a4a" : "#ffffff"}" stroke-width="3"/>
            <text y="${dest ? 7 : 5}" text-anchor="middle" font-size="${dest ? 18 : 13}">${dest ? DESTINATIONS[s.destination!]!.flag : ICONS[s.kind]}</text></g>`;
        })
        .join("")}`;
    this.map.append(this.hotLayer, this.optionLayer, this.pawnLayer);
  }

  /** Voyage à thème : les 3 destinations, et la distance qui m'en sépare (ou le joueur dont c'est le tour). */
  private renderHot(g: GlobeState): void {
    this.hotLayer.innerHTML = g.hotspots
      .map((hs) => {
        const s = g.map[hs.space]!;
        return `<g transform="translate(${s.x} ${s.y})" class="globe__hotspot"><circle r="26" fill="none" stroke="#ffc83d" stroke-width="6"/><text y="-32" text-anchor="middle" font-size="22">📷</text></g>`;
      })
      .join("");
    const who = this.meId && g.positions[this.meId] !== undefined ? this.meId : g.turn?.playerId;
    const dist = who !== undefined ? globeDistances(g.positions[who]!, g.map) : null;
    clear(this.hot);
    this.hot.append(
      h("p", { class: "globe__hot-title", text: `Voyage n° ${g.trip} · photo ${PHOTO_PRICE} pièces` }),
      ...g.hotspots.map((hs) => {
        const d = DESTINATIONS[g.map[hs.space]!.destination!]!;
        return h(
          "div",
          { class: "globe__hot-item" },
          h("span", { class: "globe__flag", text: d.flag }),
          h("span", { class: "globe__hot-name" }, h("strong", { text: d.name }), h("small", { text: d.photos[hs.photo] })),
          dist ? h("span", { class: "globe__dist", text: `${dist[hs.space]} case${dist[hs.space]! > 1 ? "s" : ""}` }) : null,
        );
      }),
    );
  }

  private renderBanner(g: GlobeState, players: PublicPlayer[]): void {
    clear(this.banner);
    const turn = g.turn;
    this.banner.append(h("small", { text: g.overtime ? `Prolongations ${g.overtime} · la prochaine photo termine la partie !` : `Tour ${Math.max(1, g.round)}/${g.rounds}` }));
    const p = turn ? players.find((x) => x.id === turn.playerId) : undefined;
    if (p) {
      this.banner.append(playerAvatar(p, { size: 34 }), h("strong", { text: p.id === this.meId ? "À toi de voyager !" : `Au tour de ${p.name}` }));
      this.banner.style.setProperty("--player", PLAYER_COLORS[p.color]?.hex ?? "#fff");
    } else this.banner.append(h("strong", { text: g.round === 0 ? "Bon voyage !" : "Nouveau tour !" }));
    const name = p?.name ?? "";
    let text = "";
    if (!turn) text = g.round === 0 ? "Tout le monde part de Paris avec 10 pièces. Visite les destinations du voyage pour leurs photos-souvenirs !" : "";
    else if (turn.text) text = `${name} ${turn.text}`;
    else if (turn.choice?.type === "card") text = p?.id === this.meId ? "Retourne une carte de la rangée, ou joue une carte de transport." : `${name} choisit une carte…`;
    this.text.textContent = text;
    this.text.classList.toggle("is-on", Boolean(text));
  }

  /** Rangée commune de cartes face cachée ; la carte retournée montre sa valeur. */
  private renderRow(g: GlobeState): void {
    clear(this.row);
    const turn = g.turn;
    const mine = turn?.playerId === this.meId && turn?.choice?.type === "card";
    for (let i = 0; i < g.row; i++) {
      const revealed = turn?.reveal?.slot === i ? turn.reveal.value : null;
      this.row.append(
        h("button", {
          class: `globe__face${revealed !== null ? " is-revealed" : ""}`,
          attrs: { type: "button", disabled: !mine || undefined, "aria-label": revealed !== null ? `Carte retournée : ${revealed}` : `Carte face cachée ${i + 1}` },
          text: revealed !== null ? String(revealed) : "?",
          on: { click: () => void sendAction({ type: "draw", slot: i }) },
        }),
      );
    }
  }

  private renderControls(g: GlobeState): void {
    clear(this.controls);
    const turn = g.turn;
    if (!turn || !this.meId || this.layout === "tv") return;
    const hand = g.hands[this.meId] ?? [];
    const mine = turn.playerId === this.meId;
    const canPlay = mine && turn.choice?.type === "card";
    const handView = h("div", { class: "globe__hand" });
    hand.forEach((card, i) =>
      handView.append(
        h(
          "button",
          {
            class: `globe__card${this.taxi?.index === i ? " is-selected" : ""}`,
            attrs: { type: "button", disabled: !canPlay || undefined, title: CARD_INFO[card.kind].help },
            on: { click: () => this.playCard(g, i, card) },
          },
          h("span", { class: "globe__card-icon", text: CARD_INFO[card.kind].icon }),
          h("strong", { text: cardLabel(card) }),
          h("small", { text: CARD_INFO[card.kind].help }),
        ),
      ),
    );
    if (!hand.length) handView.append(h("p", { class: "muted", text: "Aucune carte de transport : achète-en en boutique, ou passe par une gare." }));
    this.controls.append(h("p", { class: "globe__hot-title", text: "Mes cartes de transport" }), handView);
    if (!mine || !turn.choice) {
      if (!mine && this.layout === "pad") this.controls.append(h("p", { class: "bv-wait", text: "Regarde l'écran commun !" }));
      return;
    }
    const choice = turn.choice;
    const box = h("div", { class: "globe__choice" });
    if (choice.type === "card") {
      if (this.taxi) {
        box.append(
          h("p", { class: "bv-wait", text: "Taxi : combien de cases ?" }),
          h(
            "div",
            { class: "globe__row" },
            ...[1, 2, 3].map((n) => h("button", { class: "btn btn--go", attrs: { type: "button" }, text: String(n), on: { click: () => void sendAction({ type: "card", index: this.taxi!.index, steps: n }) } })),
          ),
        );
      } else box.append(h("p", { class: "bv-wait", text: "Retourne une des cartes sous la carte (ou joue une carte de transport)." }));
    } else if (choice.type === "move") {
      box.append(h("p", { class: "bv-wait", text: "Touche une case en jaune sur la carte, ou choisis :" }));
      for (const space of choice.options) box.append(h("button", { class: "btn btn--ghost btn--small", attrs: { type: "button" }, text: spaceName(g.map, space), on: { click: () => void sendAction({ type: "move", space }) } }));
    } else if (choice.type === "airport" || choice.type === "port" || choice.type === "super") {
      box.append(h("p", { class: "bv-wait", text: choice.type === "super" ? "Quelle destination ?" : choice.type === "airport" ? `Quel aéroport ?${choice.fee ? ` (${choice.fee} pièces)` : ""}` : `Quel port ? (${choice.fee} pièces)` }));
      for (const space of choice.options) box.append(h("button", { class: "btn btn--go", attrs: { type: "button" }, text: spaceName(g.map, space), on: { click: () => void sendAction({ type: "travel", space }) } }));
      if (choice.type !== "super" && choice.fee) box.append(h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Rester ici", on: { click: () => void sendAction({ type: "travel", space: null }) } }));
    } else if (choice.type === "shop") {
      const coins = g.coins[this.meId] ?? 0;
      box.append(h("p", { class: "bv-wait", text: `Boutique : tu as ${coins} pièces.` }));
      choice.offers.forEach((card: TravelCard, i: number) => {
        const price = CARD_INFO[card.kind].price;
        box.append(
          h("button", {
            class: "btn btn--go",
            attrs: { type: "button", disabled: price > coins || hand.length >= 4 || undefined },
            text: `${CARD_INFO[card.kind].icon} ${cardLabel(card)} · ${price} pièces`,
            on: { click: () => void sendAction({ type: "shop", index: i }) },
          }),
        );
      });
      box.append(h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Ne rien acheter", on: { click: () => void sendAction({ type: "shop", index: null }) } }));
    }
    box.append(h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }));
    this.controls.append(box);
  }

  private playCard(g: GlobeState, index: number, card: TravelCard): void {
    if (card.kind === "taxi") {
      this.taxi = { index, steps: 0 };
      this.renderControls(g);
      return;
    }
    if (card.kind === "super" && (g.coins[this.meId!] ?? 0) < PHOTO_PRICE) return;
    void sendAction({ type: "card", index });
  }

  /** Cases d'arrivée possibles : en jaune et cliquables sur la carte. */
  private renderOptions(g: GlobeState): void {
    this.optionLayer.innerHTML = "";
    const turn = g.turn;
    if (!turn || turn.choice?.type !== "move") return;
    const mine = turn.playerId === this.meId;
    for (const space of turn.choice.options) {
      const s = g.map[space]!;
      const ring = document.createElementNS(NS, "circle");
      ring.setAttribute("cx", String(s.x));
      ring.setAttribute("cy", String(s.y));
      ring.setAttribute("r", "22");
      ring.setAttribute("class", `globe__option${mine ? " is-mine" : ""}`);
      if (mine) ring.addEventListener("click", () => void sendAction({ type: "move", space }));
      this.optionLayer.append(ring);
    }
  }

  private tick(): void {
    const room = this.room;
    const g = room?.game?.globe;
    if (!room || !g) return;
    if (this.anim) {
      const k = Math.floor((performance.now() - this.anim.start) / STEP_MS);
      if (k >= this.anim.path.length - 1) {
        this.shown.set(this.anim.id, this.anim.path.at(-1)!);
        this.anim = null;
      } else this.shown.set(this.anim.id, this.anim.path[Math.max(0, k)]!);
    }
    // Pions : décalés quand plusieurs joueurs partagent la même case.
    const byCell = new Map<number, string[]>();
    for (const id of g.order) {
      const c = this.shown.get(id) ?? g.positions[id]!;
      byCell.set(c, [...(byCell.get(c) ?? []), id]);
    }
    for (const [cell, ids] of byCell) {
      ids.forEach((id, i) => {
        let pawn = this.pawns.get(id);
        const p = room.players.find((x) => x.id === id);
        if (!p) return;
        if (!pawn) {
          pawn = document.createElementNS(NS, "g");
          pawn.setAttribute("class", "globe__pawn");
          pawn.innerHTML = `<circle r="18" fill="${PLAYER_COLORS[p.color]?.hex ?? "#fff"}" stroke="#fff" stroke-width="3"/>`;
          const face = playerAvatar(p, { size: 30 });
          face.setAttribute("x", "-15");
          face.setAttribute("y", "-17");
          face.setAttribute("width", "30");
          face.setAttribute("height", "30");
          pawn.append(face);
          this.pawnLayer.append(pawn);
          this.pawns.set(id, pawn);
        }
        const s = g.map[cell]!;
        const dx = (i - (ids.length - 1) / 2) * 20;
        pawn.setAttribute("transform", `translate(${s.x + dx} ${s.y - 26})`);
      });
    }
    const el = this.controls.querySelector<HTMLElement>("[data-deadline]");
    const t = g.turn;
    if (el && t?.endsAt) el.textContent = `Choix automatique dans ${Math.max(0, Math.ceil((t.endsAt - serverNow()) / 1000))} s`;
  }
}
