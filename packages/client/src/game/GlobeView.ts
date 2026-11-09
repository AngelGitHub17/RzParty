import {
  CARD_INFO, DESTINATIONS, GLOBE_SIZE, PHOTO_PRICE, PLAYER_COLORS, cardLabel,
  type GlobeSpace, type GlobeState, type PublicPlayer, type RoomSnapshot, type SpaceKind, type TravelCard,
} from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction } from "./modeKit.ts";

const NS = "http://www.w3.org/2000/svg";
const STEP_MS = 320;

const ICONS: Record<SpaceKind, string> = {
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
  depart: "Départ : une carte offerte",
  destination: "Destination",
  boutique: "Boutique : acheter des cartes",
  aeroport: "Aéroport : s'envoler (5 pièces)",
  port: "Port : traverser (5 pièces)",
  gare: "Gare : une carte Train",
  boulot: "Petit boulot : 1 à 10 pièces",
  surprise: "Surprise !",
  unvstous: "1 contre tous",
};

/** Continents, très simplifiés (longitude, latitude). */
const CONTINENTS: [number, number][][] = [
  [[-165, 65], [-140, 70], [-95, 72], [-75, 62], [-55, 50], [-80, 25], [-97, 17], [-105, 22], [-125, 40], [-125, 50], [-150, 58]],
  [[-80, 10], [-60, 10], [-35, -7], [-40, -22], [-55, -35], [-70, -53], [-75, -40], [-80, -5]],
  [[-45, 60], [-20, 72], [-35, 80], [-60, 78]],
  [[-10, 36], [-9, 44], [-5, 48], [5, 60], [20, 70], [40, 68], [40, 45], [28, 40], [15, 38], [0, 38]],
  [[-17, 15], [-10, 30], [10, 37], [32, 31], [43, 12], [51, 12], [40, -5], [35, -25], [20, -35], [13, -20], [9, 4], [-8, 5]],
  [[40, 68], [70, 72], [110, 76], [140, 70], [170, 66], [140, 50], [130, 35], [122, 25], [108, 10], [100, 2], [95, 15], [80, 8], [72, 20], [60, 25], [48, 28], [40, 45]],
  [[114, -22], [130, -12], [142, -11], [153, -27], [146, -39], [135, -35], [115, -34]],
  [[44, -25], [47, -14], [50, -15], [48, -25]],
  [[130, 31], [136, 34], [141, 41], [142, 38], [138, 33]],
];
const project = ([lon, lat]: [number, number]) => `${(((lon + 180) / 360) * 1000).toFixed(0)},${((80 - lat) * 4).toFixed(0)}`;

function walk(from: number, steps: number, dir: 1 | -1): number[] {
  return Array.from({ length: steps }, (_, i) => (((from + dir * (i + 1)) % GLOBE_SIZE) + GLOBE_SIZE) % GLOBE_SIZE);
}

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

/** Mode « Tour du monde » : la carte, les destinations à la une, la main de cartes. */
export class GlobeView {
  private readonly el: HTMLElement;
  private readonly map = document.createElementNS(NS, "svg") as SVGSVGElement;
  private readonly pawnLayer = document.createElementNS(NS, "g");
  private readonly previewLayer = document.createElementNS(NS, "g");
  private readonly hotLayer = document.createElementNS(NS, "g");
  private readonly banner = h("div", { class: "bv-banner globe__banner" });
  private readonly text = h("p", { class: "wheel__result globe__text", attrs: { "aria-live": "polite" } });
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
  private selected: number | null | undefined = undefined;
  private taxiSteps = 0;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.map.setAttribute("viewBox", "0 0 1000 560");
    this.map.setAttribute("class", "globe__map");
    this.map.setAttribute("role", "img");
    this.map.setAttribute("aria-label", "Carte du monde et trajet");
    this.el = h(
      "section",
      { class: `globe globe--${layout}` },
      h("div", { class: "globe__main" }, this.banner, h("div", { class: "globe__map-box" }, this.map), this.text),
      h("aside", { class: "bv-side" }, this.hot, this.controls, this.table),
    );
    root.append(this.el);
    this.stop = everyFrame(() => this.tick());
  }

  destroy(): void {
    this.stop();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const g = room.game?.globe;
    if (!g) return;
    if (!this.builtMap) this.buildMap(g);
    const turn = g.turn;
    if (turn && turn.moveId !== this.shownMove) {
      this.shownMove = turn.moveId;
      if (turn.path.length > 1 || (turn.path.length === 1 && this.shown.has(turn.playerId))) {
        this.anim = { id: turn.playerId, path: turn.path, start: performance.now() };
      }
    }
    for (const [id, pos] of Object.entries(g.positions)) if (!this.anim || this.anim.id !== id) this.shown.set(id, pos);
    if (turn?.choice?.type !== "card") this.selected = undefined;
    this.renderHot(g);
    this.renderBanner(g, room.players);
    this.renderControls(g);
    this.renderPreview(g);
    clear(this.table);
    this.table.append(
      scoreTable(room.players, g.order, (id) => (g.photos[id]?.length ?? 0) * 10000 + (g.coins[id] ?? 0), (id) => `📷 ${g.photos[id]?.length ?? 0} · 🪙 ${g.coins[id] ?? 0}`, { meId: this.meId, highlight: turn?.playerId ?? null }),
    );
  }

  private buildMap(g: GlobeState): void {
    this.builtMap = true;
    const ring = g.map.map((s) => `${s.x},${s.y}`).join(" ");
    this.map.innerHTML = `<rect width="1000" height="560" fill="#5eb8f2"/>
      ${CONTINENTS.map((c) => `<polygon points="${c.map(project).join(" ")}" fill="#9be07a" stroke="#6cbf55" stroke-width="3" stroke-linejoin="round"/>`).join("")}
      <polygon points="${ring}" fill="none" stroke="#ffffff" stroke-width="7" stroke-dasharray="2 12" stroke-linecap="round" opacity="0.9"/>
      ${g.map
        .map((s) => {
          const dest = s.destination !== undefined;
          return `<g transform="translate(${s.x} ${s.y})"><title>${dest ? DESTINATIONS[s.destination!]!.name : KIND_NAMES[s.kind]}</title>
            <circle r="${dest ? 17 : 12}" fill="${dest ? "#ffffff" : "#1e2a4a"}" stroke="${dest ? "#1e2a4a" : "#ffffff"}" stroke-width="3"/>
            <text y="${dest ? 7 : 5}" text-anchor="middle" font-size="${dest ? 18 : 13}">${dest ? DESTINATIONS[s.destination!]!.flag : ICONS[s.kind]}</text></g>`;
        })
        .join("")}`;
    this.map.append(this.hotLayer, this.previewLayer, this.pawnLayer);
  }

  private renderHot(g: GlobeState): void {
    this.hotLayer.innerHTML = g.hotspots
      .map((hs) => {
        const s = g.map[hs.space]!;
        return `<g transform="translate(${s.x} ${s.y})" class="globe__hotspot"><circle r="26" fill="none" stroke="#ffc83d" stroke-width="6"/><text y="-32" text-anchor="middle" font-size="22">📷</text></g>`;
      })
      .join("");
    clear(this.hot);
    this.hot.append(
      h("p", { class: "globe__hot-title", text: `À la une · photo ${PHOTO_PRICE} pièces` }),
      ...g.hotspots.map((hs) => {
        const d = DESTINATIONS[g.map[hs.space]!.destination!]!;
        return h("div", { class: "globe__hot-item" }, h("span", { class: "globe__flag", text: d.flag }), h("span", {}, h("strong", { text: d.name }), h("small", { text: d.photos[hs.photo] })));
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
    if (!turn) text = g.round === 0 ? "Tout le monde part de Paris avec 10 pièces. Achète les photos des destinations à la une !" : "";
    else if (turn.spin && turn.text?.endsWith("…")) text = `${name} ${turn.text}`;
    else if (turn.text) text = `${name} ${turn.text}`;
    else if (turn.choice?.type === "card") text = p?.id === this.meId ? "Choisis une carte de transport et une direction." : `${name} choisit sa carte de transport…`;
    this.text.textContent = text;
    this.text.classList.toggle("is-on", Boolean(text));
  }

  private renderControls(g: GlobeState): void {
    clear(this.controls);
    const turn = g.turn;
    if (!turn || !this.meId || this.layout === "tv") return;
    const hand = g.hands[this.meId] ?? [];
    const mine = turn.playerId === this.meId;
    const handView = h("div", { class: "globe__hand" });
    // Ma main est toujours visible (même hors de mon tour).
    hand.forEach((card, i) =>
      handView.append(
        h(
          "button",
          {
            class: `globe__card${this.selected === i ? " is-selected" : ""}`,
            attrs: { type: "button", disabled: !(mine && turn.choice?.type === "card") || undefined, title: CARD_INFO[card.kind].help },
            on: { click: () => this.select(g, i, card) },
          },
          h("span", { class: "globe__card-icon", text: CARD_INFO[card.kind].icon }),
          h("strong", { text: cardLabel(card) }),
          h("small", { text: CARD_INFO[card.kind].help }),
        ),
      ),
    );
    if (!hand.length) handView.append(h("p", { class: "muted", text: "Plus de cartes : tu iras à pied (1 à 3 cases)." }));
    this.controls.append(h("p", { class: "globe__hot-title", text: "Mes cartes" }), handView);
    if (!mine || !turn.choice) {
      if (!mine && this.layout === "pad") this.controls.append(h("p", { class: "bv-wait", text: "Regarde l'écran commun !" }));
      return;
    }
    const choice = turn.choice;
    const box = h("div", { class: "globe__choice" });
    if (choice.type === "card") {
      const card = this.selected === undefined ? undefined : this.selected === null ? null : hand[this.selected];
      if (!hand.length && this.selected === undefined) this.selected = null;
      const pickedNoCard = this.selected === null;
      if (card === undefined && !pickedNoCard) box.append(h("p", { class: "bv-wait", text: "Choisis une carte." }));
      else if (card && (card.kind === "avion" || card.kind === "super")) {
        box.append(h("button", { class: "btn btn--go", attrs: { type: "button" }, text: card.kind === "avion" ? "Prendre l'avion" : "Partir en Super voyage", on: { click: () => void this.play(1) } }));
      } else {
        if (card?.kind === "taxi") {
          box.append(
            h("p", { class: "bv-wait", text: "Combien de cases ?" }),
            h("div", { class: "globe__row" }, ...[1, 2, 3].map((n) => h("button", { class: `btn ${this.taxiSteps === n ? "btn--go" : "btn--ghost"}`, attrs: { type: "button" }, text: String(n), on: { click: () => ((this.taxiSteps = n), this.renderControls(g), this.renderPreview(g)) } }))),
          );
        }
        if (card?.kind !== "taxi" || this.taxiSteps) {
          box.append(
            h("p", { class: "bv-wait", text: pickedNoCard ? "À pied : dans quelle direction ?" : "Dans quelle direction ?" }),
            h(
              "div",
              { class: "globe__row" },
              h("button", { class: "btn btn--go", attrs: { type: "button" }, text: "◀ Ouest", on: { click: () => void this.play(-1) } }),
              h("button", { class: "btn btn--go", attrs: { type: "button" }, text: "Est ▶", on: { click: () => void this.play(1) } }),
            ),
          );
        }
      }
      if (card?.kind === "super" && (g.coins[this.meId] ?? 0) < PHOTO_PRICE) box.append(h("p", { class: "form-error", text: "Il faut 10 pièces pour la photo." }));
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

  private select(g: GlobeState, index: number, _card: TravelCard): void {
    this.selected = index;
    this.taxiSteps = 0;
    this.renderControls(g);
    this.renderPreview(g);
  }

  private async play(dir: 1 | -1): Promise<void> {
    const g = this.room?.game?.globe;
    if (!g) return;
    const card = this.selected === null || this.selected === undefined ? null : g.hands[this.meId!]![this.selected];
    await sendAction({ type: "card", index: this.selected ?? null, dir, ...(card?.kind === "taxi" ? { steps: this.taxiSteps } : {}) });
    this.selected = undefined;
    this.taxiSteps = 0;
  }

  /** Aperçu des deux trajets possibles pour la carte choisie. */
  private renderPreview(g: GlobeState): void {
    this.previewLayer.innerHTML = "";
    const turn = g.turn;
    if (!turn || turn.playerId !== this.meId || turn.choice?.type !== "card" || this.selected === undefined) return;
    const card = this.selected === null ? null : g.hands[this.meId]![this.selected];
    const steps = card === null ? 0 : card?.kind === "train" || card?.kind === "helico" ? card.value ?? 8 : card?.kind === "taxi" ? this.taxiSteps : 0;
    if (!steps) return;
    const pos = g.positions[this.meId]!;
    this.previewLayer.innerHTML = ([1, -1] as const)
      .map((dir) => {
        const path = [pos, ...walk(pos, steps, dir)].map((id) => `${g.map[id]!.x},${g.map[id]!.y}`).join(" ");
        const end = g.map[walk(pos, steps, dir).at(-1)!]!;
        return `<polyline points="${path}" fill="none" stroke="#ffc83d" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/><circle cx="${end.x}" cy="${end.y}" r="22" fill="none" stroke="#ffc83d" stroke-width="5"/>`;
      })
      .join("");
  }

  private tick(): void {
    const room = this.room;
    const g = room?.game?.globe;
    if (!room || !g) return;
    // Animation du déplacement en cours.
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
