import { LUCKY_OUTCOMES, PLAYER_COLORS, type PublicPlayer, type RoomSnapshot, type WheelKind, type WheelState, wheelPhase } from "@rzparty/shared";
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
    const r = 60;
    text.setAttribute("x", String(r * Math.cos(mid)));
    text.setAttribute("y", String(r * Math.sin(mid)));
    // Texte dans l'axe de la part, jamais à l'envers sur la moitié gauche.
    const deg = (mid * 180) / Math.PI + (Math.cos(mid) < -0.01 ? 180 : 0);
    text.setAttribute("transform", `rotate(${deg} ${r * Math.cos(mid)} ${r * Math.sin(mid)})`);
    if (n > 14) text.setAttribute("font-size", seg.label.length > 6 ? "6.4" : "9");
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

/** Ce que fait chaque sorte de case (légende). */
const KIND_HELP: Record<WheelKind, string> = {
  gain: "Médailles prises à la banque",
  perte: "Médailles perdues, données à la banque",
  moitie: "La moitié de tes médailles part à la banque",
  banque: "Médailles ajoutées à la banque",
  multi: "La banque est multipliée",
  bataille4: "Mini-jeu à tous : le gagnant rafle la banque",
  bataille13: "Seul contre tous : la banque au vainqueur",
  duel: "Duel : le gagnant prend la moitié des médailles de l'autre",
  chance: "Petite roue : rien, la moitié ou toute la banque",
};

const PHASE_NAMES = ["Début de partie", "Milieu de partie", "Fin de partie", "Prolongations"];
const PHASE_NEWS = [
  "",
  "La roue change : voici les cases ½, Chance, Duel et 1 contre tous !",
  "Fin de partie : plus de duels, de ½… et le dernier choisit le mini-jeu des batailles !",
  "Prolongations ! La première Bataille décide de la fin de la partie.",
];

/**
 * Mode « Grande Roue » : la roue au centre, les médailles et la banque à côté,
 * et le bouton « Lancer la roue » pour le joueur dont c'est le tour.
 */
export class WheelView {
  private readonly el: HTMLElement;
  private readonly rotor = h("div", { class: "wheel__rotor" });
  private readonly banner = h("div", { class: "bv-banner wheel__banner" });
  private readonly result = h("p", { class: "wheel__result", attrs: { "aria-live": "polite" } });
  private readonly lucky = h("div", { class: "wheel__lucky", attrs: { hidden: true } });
  private readonly controls = h("div", { class: "bv-controls" });
  private readonly pot = h("p", { class: "wheel__pot" });
  private readonly table = h("ol", { class: "bv-order" });
  private readonly legend = h("ul", { class: "wheel__legend" });
  private angle = 0;
  private shownSpin = -1;
  private builtPhase = -1;
  private room: RoomSnapshot | null = null;
  private busy = false;
  private luckyShownAt = 0;
  private luckySpin = -1;
  private stopTicker: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `wheel wheel--${layout}` },
      h("div", { class: "wheel__stage" }, this.banner, h("div", { class: "wheel__pointer", attrs: { "aria-hidden": "true" } }), this.rotor, this.lucky, this.result),
      h("aside", { class: "bv-side" }, this.pot, this.controls, this.table, layout === "pad" ? null : this.legend),
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
    if (this.builtPhase !== w.phase) {
      // Nouvelle roue : on la redessine (même position de départ).
      this.builtPhase = w.phase;
      this.rotor.replaceChildren(buildWheel(w));
      this.rotor.classList.remove("is-new");
      void this.rotor.offsetWidth;
      if (w.round > 1) this.rotor.classList.add("is-new");
      this.renderLegend(w);
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
    if (turn?.phase === "lucky" && turn.spinId !== this.luckySpin) {
      this.luckySpin = turn.spinId;
      this.luckyShownAt = performance.now();
    }
    this.renderLucky(w);
    this.renderBanner(w, room.players);
    this.renderControls(w, room.players);
    this.renderTable(w, room.players);
    this.pot.replaceChildren(h("span", { text: "Banque" }), h("strong", { text: `${MEDAL} ${w.pot}` }));
  }

  private name(players: PublicPlayer[], id: string): string {
    return players.find((p) => p.id === id)?.name ?? "?";
  }

  private renderLegend(w: WheelState): void {
    clear(this.legend);
    const seen = new Set<string>();
    for (const seg of w.segments) {
      const key = `${seg.kind}:${seg.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const count = w.segments.filter((s) => s.kind === seg.kind && s.value === seg.value).length;
      this.legend.append(
        h("li", {}, h("span", { class: "wheel__chip", style: { background: seg.color }, text: seg.label }), h("span", { class: "muted", text: `${KIND_HELP[seg.kind]} (×${count})` })),
      );
    }
  }

  private renderLucky(w: WheelState): void {
    const t = w.turn;
    const on = t?.phase === "lucky" || (t?.phase === "result" && t.lucky !== undefined && t.spinId === this.luckySpin);
    this.lucky.hidden = !on;
    if (!on) return;
    if (!this.lucky.childElementCount) {
      this.lucky.append(h("strong", { text: "Chance !" }), ...LUCKY_OUTCOMES.map((o) => h("span", { class: "wheel__lucky-opt", text: o.label })));
    }
  }

  private renderBanner(w: WheelState, players: PublicPlayer[]): void {
    clear(this.banner);
    const p = w.turn ? players.find((x) => x.id === w.turn!.playerId) : undefined;
    this.banner.append(h("small", { text: w.overtime ? `Prolongations ${w.overtime}` : `Tour ${w.round}/${w.rounds} · ${PHASE_NAMES[w.phase]}` }));
    if (p) {
      this.banner.append(playerAvatar(p, { size: 34 }), h("strong", { text: p.id === this.meId ? "À toi de lancer !" : `Au tour de ${p.name}` }));
      this.banner.style.setProperty("--player", PLAYER_COLORS[p.color]?.hex ?? "#fff");
    } else this.banner.append(h("strong", { text: "Nouveau tour !" }));
    const t = w.turn;
    const chooser = t?.chooser ? this.name(players, t.chooser) : "";
    this.result.textContent = !t
      ? w.round > 1 && wheelPhase(w.round - 1, w.rounds) !== w.phase
        ? PHASE_NEWS[w.phase]!
        : w.round === 1
          ? "Tout le monde a 500 médailles, la banque aussi. Que la roue tourne !"
          : ""
      : t.phase === "spinning"
        ? "La roue tourne…"
        : t.phase === "lucky"
          ? "La petite roue de la Chance tourne…"
          : t.phase === "pickgame"
            ? `${chooser}, dernier au classement, choisit le mini-jeu de la Bataille…`
            : t.text
              ? `${this.name(players, t.playerId)} ${t.text}`
              : "";
    this.result.classList.toggle("is-on", Boolean(this.result.textContent));
  }

  private renderControls(w: WheelState, players: PublicPlayer[]): void {
    clear(this.controls);
    const t = w.turn;
    if (!t || !this.meId || this.layout === "tv") return;
    if ((t.phase === "choose" || t.phase === "pickgame") && t.chooser === this.meId && t.options) {
      this.controls.append(
        h("p", { class: "bv-wait", text: t.phase === "choose" ? "Qui défies-tu en duel ?" : "Choisis le mini-jeu de la Bataille :" }),
        ...t.options.map((o) =>
          h("button", {
            class: "btn btn--go",
            attrs: { type: "button" },
            text: o.label,
            on: { click: () => void this.send(t.phase === "choose" ? { type: "duel", target: o.id } : { type: "pick", game: o.id }) },
          }),
        ),
        h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }),
      );
      return;
    }
    if (t.playerId !== this.meId) {
      if (this.layout === "pad") this.controls.append(h("p", { class: "bv-wait", text: `${this.name(players, t.playerId)} lance la roue. Regarde l'écran commun !` }));
      return;
    }
    if (t.phase === "spin") {
      this.controls.append(
        h("button", { class: "btn btn--go btn--big", attrs: { type: "button" }, text: "Lancer la roue", on: { click: () => void this.send({ type: "spin" }) } }),
        h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }),
      );
    }
  }

  private async send(action: { type: "spin" } | { type: "duel"; target: string } | { type: "pick"; game: string }): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await request("game:action", action);
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
      const rank = sorted.findIndex((x) => (w.medals[x] ?? 0) === (w.medals[id] ?? 0)) + 1;
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
    // Petite roue « Chance » : la case allumée défile, ralentit, puis s'arrête sur le résultat.
    if (t && t.lucky !== undefined && !this.lucky.hidden) {
      const opts = [...this.lucky.querySelectorAll<HTMLElement>(".wheel__lucky-opt")];
      const elapsed = performance.now() - this.luckyShownAt;
      let lit = t.lucky;
      if (t.phase === "lucky" && elapsed < 2600) {
        const steps = Math.floor(Math.pow(elapsed / 2600, 0.55) * 14);
        lit = (t.lucky + 1 + steps) % opts.length;
        if (steps >= 13) lit = t.lucky;
      }
      opts.forEach((o, i) => o.classList.toggle("is-lit", i === lit));
    }
    const el = this.controls.querySelector<HTMLElement>("[data-deadline]");
    if (!el || !t?.endsAt) return;
    const left = Math.max(0, Math.ceil((t.endsAt - serverNow()) / 1000));
    el.textContent = t.phase === "spin" ? `Lancer automatique dans ${left} s` : `Choix automatique dans ${left} s`;
  }
}
