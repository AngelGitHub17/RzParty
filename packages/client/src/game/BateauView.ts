import { BOAT_LIMIT, BOAT_PLACES, BOAT_SIZE_LABELS, boatFreeSlots, boatTorque, normalizeAvatar, type BateauState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { avatarSvg, playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction } from "./modeKit.ts";

const YARD_NAMES = ["vergue verte (en haut)", "vergue jaune (au milieu)", "vergue violette (en bas)"];
const YARD_CLASS = ["is-green", "is-yellow", "is-purple"];

/** Mode « Bateau d'équilibre » : le mât et ses 3 vergues, le penchant, le personnage à poser. */
export class BateauView {
  private readonly el: HTMLElement;
  private readonly head = h("div", { class: "boat__head" });
  private readonly text = h("p", { class: "boat__text", attrs: { "aria-live": "polite" } });
  private readonly ship = h("div", { class: "boat__ship" });
  private readonly gauge = h("div", { class: "boat__gauge" }, h("span", { class: "boat__needle" }));
  private readonly hand = h("div", { class: "boat__hand" });
  private readonly table = h("div", {});
  private room: RoomSnapshot | null = null;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `boat boat--${layout}` },
      h("div", { class: "boat__main" }, this.head, this.text, this.hand, this.ship, this.gauge),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table),
    );
    root.append(this.el);
    this.stop = everyFrame(() => this.tick());
  }

  destroy(): void {
    this.stop();
    this.el.remove();
  }

  private myTurn(b: BateauState): boolean {
    return this.layout !== "tv" && this.meId !== null && b.turn === this.meId;
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const b = room.game?.bateau;
    if (!b) return;
    clear(this.head);
    this.head.append(h("strong", { text: `${b.sailors.length}/${b.goal} à bord` }), h("span", { class: "muted", text: `Tour ${Math.max(1, b.round)}` }));
    this.renderShip(b);
    this.renderHand(b, room);
    const needle = this.gauge.firstElementChild as HTMLElement;
    needle.style.left = `${50 + Math.max(-1, Math.min(1, b.tilt / BOAT_LIMIT)) * 50}%`;
    this.gauge.classList.toggle("is-danger", Math.abs(b.tilt) > BOAT_LIMIT * 0.7);
    clear(this.table);
    const ids = room.game!.standings.map((s) => s.playerId);
    const score = (id: string) => b.sailors.filter((s) => s.by === id).length;
    this.table.append(scoreTable(room.players, ids, score, (id) => `${score(id)} embarqué${score(id) > 1 ? "s" : ""}`, { meId: this.meId, highlight: b.turn }));
  }

  private renderShip(b: BateauState): void {
    clear(this.ship);
    const angle = Math.max(-1.3, Math.min(1.3, b.tilt / BOAT_LIMIT)) * 16;
    this.ship.classList.toggle("is-sunk", b.phase === "sunk");
    this.ship.classList.toggle("is-won", b.phase === "won");
    const current = b.queue[0];
    const mine = this.myTurn(b) && current;
    const free = current ? boatFreeSlots(b.sailors, current.sailor.yard) : [];
    const rig = h("div", { class: "boat__rig", style: { transform: `rotate(${angle}deg)` } }, h("span", { class: "boat__mast" }));
    for (let yard = 0; yard < 3; yard++) {
      rig.append(
        h(
          "div",
          { class: `boat__yard ${YARD_CLASS[yard]}` },
          ...BOAT_PLACES.map((slot) => {
            const s = b.sailors.find((x) => x.yard === yard && x.slot === slot);
            const target = mine && current.sailor.yard === yard && free.includes(slot);
            const preview = target ? boatTorque({ ...current.sailor, slot }) + b.tilt : 0;
            const cell = h(
              target ? "button" : "span",
              {
                class: `boat__place${slot === 1 ? " is-right" : ""}${target ? ` is-target${Math.abs(preview) > BOAT_LIMIT ? " is-risky" : ""}` : ""}`,
                attrs: target ? { type: "button", "aria-label": `Poser ${slot < 0 ? "à gauche" : "à droite"}, ${Math.abs(slot)} du mât` } : {},
                on: target ? { click: () => void sendAction({ type: "place", slot }) } : {},
              },
              s ? h("span", { class: `boat__sailor size-${s.size}` }, avatarSvg(normalizeAvatar(s.avatar), { size: 24 + s.size * 9 })) : null,
            );
            return cell;
          }),
        ),
      );
    }
    this.ship.append(rig, h("div", { class: "boat__hull", style: { transform: `rotate(${angle * 0.6}deg)` } }), h("div", { class: "boat__sea" }));
  }

  private renderHand(b: BateauState, room: RoomSnapshot): void {
    clear(this.hand);
    const current = b.queue[0];
    if (!current || b.phase !== "place") return;
    const p = room.players.find((x) => x.id === current.playerId);
    this.hand.append(
      ...(p ? [playerAvatar(p, { size: 30 })] : []),
      h("span", { text: p ? `${p.name} embarque :` : "" }),
      h("span", { class: `boat__sailor size-${current.sailor.size}` }, avatarSvg(normalizeAvatar(current.sailor.avatar), { size: 30 + current.sailor.size * 10 })),
      h("strong", { text: `${BOAT_SIZE_LABELS[current.sailor.size]} · ${YARD_NAMES[current.sailor.yard]}` }),
      ...b.queue.slice(1).map((q) => h("span", { class: `boat__sailor is-next size-${q.sailor.size}` }, avatarSvg(normalizeAvatar(q.sailor.avatar), { size: 16 + q.sailor.size * 6 }))),
    );
  }

  private tick(): void {
    const b = this.room?.game?.bateau;
    if (!b) return;
    const left = b.endsAt ? Math.max(0, Math.ceil((b.endsAt - serverNow()) / 1000)) : 0;
    const who = this.room!.players.find((p) => p.id === b.turn)?.name ?? "";
    if (b.phase === "sunk") this.text.textContent = "Patatras ! Le bateau a chaviré…";
    else if (b.phase === "won") this.text.textContent = "Tout le monde est à bord : bravo l'équipage !";
    else if (this.myTurn(b)) this.text.textContent = `À toi ! Pose ton personnage sur sa vergue. Loin du mât, il fait plus pencher (${left} s)`;
    else if (b.turn) this.text.textContent = `${who} pose son personnage… ${left ? `(${left} s)` : ""}`;
    else if (b.gust) this.text.textContent = `Coup de vent ${b.gust > 0 ? "vers la droite" : "vers la gauche"} ! Le bateau penche un peu.`;
    else this.text.textContent = "Embarquez tout le monde sans faire chavirer le bateau !";
  }
}
