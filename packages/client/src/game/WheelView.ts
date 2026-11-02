import { PLAYER_COLORS, type PublicPlayer, type RoomSnapshot, type WheelState } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { request, ServerError } from "../net/connection.ts";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { toast } from "../ui/toast.ts";
import { serverNow } from "./clock.ts";

const NS = "http://www.w3.org/2000/svg";
const MEDAL = "🏅";

/** Construit la roue en SVG : une part par case, son libellé au bord. */
function buildWheel(state: WheelState): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-110 -110 220 220");
  svg.setAttribute("class", "wheel__svg");
  const n = state.segments.length;
  const step = (Math.PI * 2) / n;
  state.segments.forEach((seg, i) => {
    const a0 = -Math.PI / 2 + i * step;
    const a1 = a0 + step;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M0 0 L${100 * Math.cos(a0)} ${100 * Math.sin(a0)} A100 100 0 0 1 ${100 * Math.cos(a1)} ${100 * Math.sin(a1)} Z`);
    path.setAttribute("fill", seg.color);
    path.setAttribute("stroke", "#fff");
    path.setAttribute("stroke-width", "1.5");
    svg.append(path);
    const mid = a0 + step / 2;
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", String(66 * Math.cos(mid)));
    text.setAttribute("y", String(66 * Math.sin(mid)));
    text.setAttribute("transform", `rotate(${(mid * 180) / Math.PI} ${66 * Math.cos(mid)} ${66 * Math.sin(mid)})`);
    text.setAttribute("class", "wheel__label");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.textContent = seg.label;
    svg.append(text);
  });
  const hub = document.createElementNS(NS, "circle");
  hub.setAttribute("r", "14");
  hub.setAttribute("fill", "#fff");
  hub.setAttribute("stroke", "#1e2a4a");
  hub.setAttribute("stroke-width", "3");
  svg.append(hub);
  return svg;
}

/**
 * Mode « Grande Roue » : la roue au centre, les médailles et la cagnotte à côté,
 * et le bouton « Lancer la roue » pour le joueur dont c'est le tour.
 */
export class WheelView {
  private readonly el: HTMLElement;
  private readonly rotor = h("div", { class: "wheel__rotor" });
  private readonly banner = h("div", { class: "bv-banner wheel__banner" });
  private readonly result = h("p", { class: "wheel__result", attrs: { "aria-live": "polite" } });
  private readonly controls = h("div", { class: "bv-controls" });
  private readonly pot = h("p", { class: "wheel__pot" });
  private readonly table = h("ol", { class: "bv-order" });
  private angle = 0;
  private shownSpin = -1;
  private built = false;
  private room: RoomSnapshot | null = null;
  private busy = false;
  private stopTicker: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `wheel wheel--${layout}` },
      h("div", { class: "wheel__stage" }, this.banner, h("div", { class: "wheel__pointer", attrs: { "aria-hidden": "true" } }), this.rotor, this.result),
      h("aside", { class: "bv-side" }, this.pot, this.controls, this.table),
    );
    root.append(this.el);
    this.stopTicker = everyFrame(() => this.tick());
  }

  destroy(): void {
    this.stopTicker();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const w = room.game?.wheel;
    if (!w) return;
    if (!this.built) {
      this.rotor.append(buildWheel(w));
      this.built = true;
    }
    const turn = w.turn;
    // Nouveau lancer : la roue tourne plusieurs fois puis s'arrête sur la case tirée (sous le repère, en haut).
    if (turn && turn.segment !== null && turn.spinId !== this.shownSpin) {
      this.shownSpin = turn.spinId;
      const step = 360 / w.segments.length;
      const target = -(turn.segment + 0.5) * step;
      const current = ((this.angle % 360) + 360) % 360;
      let delta = (((target - current) % 360) + 360) % 360;
      delta += 360 * 5;
      this.angle += delta;
      this.rotor.style.transition = turn.phase === "spinning" ? "transform 3.4s cubic-bezier(0.15, 0.7, 0.2, 1)" : "none";
      this.rotor.style.transform = `rotate(${this.angle}deg)`;
    }
    this.renderBanner(w, room.players);
    this.renderControls(w, room.players);
    this.renderTable(w, room.players);
    this.pot.replaceChildren(h("span", { text: "Cagnotte" }), h("strong", { text: `${MEDAL} ${w.pot}` }));
  }

  private name(players: PublicPlayer[], id: string): string {
    return players.find((p) => p.id === id)?.name ?? "?";
  }

  private renderBanner(w: WheelState, players: PublicPlayer[]): void {
    clear(this.banner);
    const p = w.turn ? players.find((x) => x.id === w.turn!.playerId) : undefined;
    this.banner.append(h("small", { text: `Tour ${w.round}/${w.rounds}` }));
    if (p) {
      this.banner.append(playerAvatar(p, { size: 34 }), h("strong", { text: p.id === this.meId ? "À toi de lancer !" : `Au tour de ${p.name}` }));
      this.banner.style.setProperty("--player", PLAYER_COLORS[p.color]?.hex ?? "#fff");
    } else this.banner.append(h("strong", { text: "Nouveau tour !" }));
    const t = w.turn;
    this.result.textContent = t?.phase === "result" && t.text ? `${this.name(players, t.playerId)} ${t.text}` : t?.phase === "spinning" ? "La roue tourne…" : "";
    this.result.classList.toggle("is-on", Boolean(this.result.textContent));
  }

  private renderControls(w: WheelState, players: PublicPlayer[]): void {
    clear(this.controls);
    const t = w.turn;
    if (!t || !this.meId || this.layout === "tv") return;
    if (t.playerId !== this.meId) {
      if (this.layout === "pad") this.controls.append(h("p", { class: "bv-wait", text: `${this.name(players, t.playerId)} lance la roue. Regarde l'écran commun !` }));
      return;
    }
    if (t.phase === "spin") {
      this.controls.append(
        h("button", { class: "btn btn--go btn--big", attrs: { type: "button" }, text: "Lancer la roue", on: { click: () => void this.spin() } }),
        h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }),
      );
    }
  }

  private async spin(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await request("game:action", { type: "spin" });
    } catch (err) {
      toast(err instanceof ServerError ? err.message : "Action impossible.", "error");
    } finally {
      this.busy = false;
    }
  }

  private renderTable(w: WheelState, players: PublicPlayer[]): void {
    clear(this.table);
    const sorted = [...w.order].sort((a, b) => (w.medals[b] ?? 0) - (w.medals[a] ?? 0));
    for (const id of w.order) {
      const p = players.find((x) => x.id === id);
      if (!p) continue;
      const rank = sorted.indexOf(id) + 1;
      this.table.append(
        h(
          "li",
          { class: `bv-row${w.turn?.playerId === id ? " is-turn" : ""}${id === this.meId ? " is-me" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
          h("span", { class: "bv-row__rank", text: rank === 1 ? "1er" : `${rank}e` }),
          playerAvatar(p, { size: 36 }),
          h("span", { class: "bv-row__name", text: p.name }),
          h("span", { class: "bv-row__coins" }, h("span", { text: `${MEDAL} ${w.medals[id] ?? 0}` })),
        ),
      );
    }
  }

  private tick(): void {
    const t = this.room?.game?.wheel?.turn;
    const el = this.controls.querySelector<HTMLElement>("[data-deadline]");
    if (!el || !t?.endsAt) return;
    el.textContent = `Lancer automatique dans ${Math.max(0, Math.ceil((t.endsAt - serverNow()) / 1000))} s`;
  }
}
