import { INTRUS_POINTS, PLAYER_COLORS, type IntrusState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { scoreTable, sendAction, with3D } from "./modeKit.ts";
import { amIntruder, onMyItems } from "./boardPrivate.ts";
import { secondsLeft } from "./salonKit.ts";
import type { IntrusScene } from "../three/intrusScene.ts";

/**
 * Mode « L'intrus », entre les mini-jeux : l'annonce secrète (seul l'intrus sait qu'il triche),
 * le vote (qui a triché ?) et la révélation.
 */
export class IntrusView {
  private readonly el: HTMLElement;
  private readonly stage3d = h("div", { class: "salon__3d" });
  private readonly head = h("div", { class: "salon__head" });
  private readonly timer = h("div", { class: "salon__timer" });
  private readonly stageBox = h("div", { class: "salon__stage" });
  private readonly table = h("div", {});
  private scene: IntrusScene | null = null;
  private room: RoomSnapshot | null = null;
  private gone = false;
  private stop: () => void;
  private offSecret: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    const main = h("div", { class: "salon__main" }, this.stage3d, this.head, this.timer, this.stageBox);
    this.el = h("section", { class: `salon salon--intrus salon--${layout}` }, main, layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table));
    root.append(this.el);
    with3D(this.stage3d, () => import("../three/intrusScene.ts"), ({ IntrusScene }, host) => {
      if (this.gone) return false;
      this.scene = new IntrusScene(host, layout !== "tv");
      const s = this.room?.game?.intrus;
      if (s && this.room) this.scene.update(s, this.room.players);
      return true;
    });
    // Le secret peut arriver juste après l'état du salon.
    this.offSecret = onMyItems(() => this.room && this.update(this.room));
    this.stop = everyFrame(() => {
      const s = this.room?.game?.intrus;
      const left = s ? secondsLeft(s.endsAt) : null;
      this.timer.textContent = left === null ? "" : `⏱ ${left} s`;
    });
  }

  destroy(): void {
    this.gone = true;
    this.scene?.destroy();
    this.stop();
    this.offSecret();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const s = room.game?.intrus;
    if (!s) return;
    this.scene?.update(s, room.players);
    clear(this.head);
    this.head.append(h("small", { text: `Manche ${s.round}/${s.rounds}` }));
    this.render(s, room);
    clear(this.table);
    this.table.append(scoreTable(room.players, Object.keys(s.scores), (id) => s.scores[id] ?? 0, (id) => `${s.scores[id] ?? 0} pt${(s.scores[id] ?? 0) > 1 ? "s" : ""}`, { meId: this.meId }));
  }

  private name(room: RoomSnapshot, id: string | null | undefined): string {
    return room.players.find((p) => p.id === id)?.name ?? "?";
  }

  private render(s: IntrusState, room: RoomSnapshot): void {
    clear(this.stageBox);
    const device = this.layout !== "tv" && this.meId !== null;
    if (s.phase === "brief") {
      if (device && amIntruder()) {
        this.stageBox.append(
          h("div", { class: "salon__emoji", text: "🦹" }),
          h("p", { class: "salon__big intrus__secret", text: "Chut… C'est TOI l'intrus !" }),
          h("p", { class: "muted", text: "Pendant le mini-jeu, tu recevras des coups de pouce secrets (« Psst… »). Gagne… mais pas trop, sinon on va te démasquer !" }),
        );
      } else {
        this.stageBox.append(
          h("div", { class: "salon__emoji", text: "🕵️" }),
          h("p", { class: "salon__big", text: "Un intrus a été désigné en secret…" }),
          h("p", { class: "muted", text: "Pendant le mini-jeu, il va tricher. Ouvrez l'œil : qui réussit un peu trop bien ?" }),
        );
      }
      return;
    }
    if (s.phase === "vote") {
      const voted = this.meId ? s.voted.includes(this.meId) : false;
      this.stageBox.append(h("p", { class: "salon__big", text: device && !voted ? `Qui a triché pendant « ${s.game ?? "le mini-jeu"} » ?` : `Vote en cours… (${s.voted.length}/${Object.keys(s.scores).length})` }));
      if (device && !voted) {
        if (amIntruder()) this.stageBox.append(h("p", { class: "muted", text: "Vote toi aussi pour quelqu'un d'autre, pour ne pas te trahir 😉" }));
        const grid = h("div", { class: "salon__who-grid" });
        for (const p of room.players) {
          if (p.id === this.meId || !(p.id in s.scores)) continue;
          grid.append(
            h(
              "button",
              { class: "salon__who-btn", attrs: { type: "button" }, style: { "--player": PLAYER_COLORS[p.color]?.hex }, on: { click: () => void sendAction({ type: "vote", suspect: p.id }) } },
              playerAvatar(p, { size: 64 }),
              h("span", { text: p.name }),
            ),
          );
        }
        this.stageBox.append(grid);
      } else if (voted) this.stageBox.append(h("p", { class: "muted", text: "Vote envoyé ! On attend les autres…" }));
      return;
    }
    if (s.phase === "reveal" && s.reveal) {
      const r = s.reveal;
      const cheater = room.players.find((p) => p.id === r.cheater);
      const caught = Object.entries(r.votes).filter(([v, sus]) => v !== r.cheater && sus === r.cheater).map(([v]) => this.name(room, v));
      this.stageBox.append(
        cheater ? playerAvatar(cheater, { size: 96 }) : h("div", { class: "salon__emoji", text: "🦹" }),
        h("p", { class: "salon__big", text: `L'intrus, c'était ${this.name(room, r.cheater)} !` }),
        h("p", { class: "muted", text: caught.length ? `Démasqué par ${caught.join(", ")} (+${INTRUS_POINTS.caught} chacun).` : "Personne ne l'a démasqué !" }),
      );
      if (r.gains[r.cheater]) this.stageBox.append(h("p", { class: "salon__oops", text: `Passé presque inaperçu : +${INTRUS_POINTS.unseen} pour l'intrus !` }));
      const list = h("ul", { class: "intrus__votes" });
      for (const [voter, suspect] of Object.entries(r.votes)) {
        list.append(h("li", { class: suspect === r.cheater && voter !== r.cheater ? "is-right" : "" }, h("span", { text: `${this.name(room, voter)} → ${this.name(room, suspect)}` })));
      }
      this.stageBox.append(list);
    }
  }
}
