import { BATAILLE_TEAMS, PLAYER_COLORS, type BatailleState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { with3D } from "./modeKit.ts";
import type { BatailleScene } from "../three/batailleScene.ts";

/** Mode « Bataille », entre deux mini-jeux : les équipes et la corde. */
export class BatailleView {
  private readonly el: HTMLElement;
  private readonly stage3d = h("div", { class: "salon__3d" });
  private readonly info = h("div", { class: "salon__stage" });
  private scene: BatailleScene | null = null;
  private room: RoomSnapshot | null = null;
  private gone = false;

  constructor(root: HTMLElement, layout: ViewLayout, private readonly meId: string | null) {
    this.el = h("section", { class: `salon salon--bataille salon--${layout} salon--wide` }, h("div", { class: "salon__main" }, this.stage3d, this.info));
    root.append(this.el);
    with3D(this.stage3d, () => import("../three/batailleScene.ts"), ({ BatailleScene }, host) => {
      if (this.gone) return false;
      this.scene = new BatailleScene(host, layout !== "tv");
      const b = this.room?.game?.bataille;
      if (b && this.room) this.scene.update(b, this.room.players);
      return true;
    });
  }

  destroy(): void {
    this.gone = true;
    this.scene?.destroy();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const b = room.game?.bataille;
    if (!b) return;
    this.scene?.update(b, room.players);
    this.render(b, room);
  }

  private render(b: BatailleState, room: RoomSnapshot): void {
    clear(this.info);
    const mine = this.meId ? (b.teams[0].includes(this.meId) ? 0 : b.teams[1].includes(this.meId) ? 1 : null) : null;
    const title =
      b.round === 0
        ? mine !== null
          ? `Tu es dans l'${BATAILLE_TEAMS[mine]!.label} ${BATAILLE_TEAMS[mine]!.emoji} !`
          : "Voici les équipes !"
        : b.last?.winner != null
          ? `L'${BATAILLE_TEAMS[b.last.winner]!.label} tire le foulard ! (${b.last.points[0]} contre ${b.last.points[1]} points de place en moyenne)`
          : "Égalité : la corde ne bouge pas !";
    this.info.append(h("p", { class: "salon__big", text: title }));
    // Jauge de la corde, lisible même sans 3D.
    const track = h("div", { class: "bataille__track" });
    for (let k = -b.goal; k <= b.goal; k++) {
      track.append(h("span", { class: `bataille__notch${k === b.rope ? " is-flag" : ""}${k === -b.goal ? " is-sun" : ""}${k === b.goal ? " is-moon" : ""}` }));
    }
    this.info.append(track);
    const teams = h("div", { class: "bataille__teams" });
    BATAILLE_TEAMS.forEach((t, i) => {
      teams.append(
        h(
          "div",
          { class: "bataille__team", style: { "--team": t.hex } },
          h("strong", { text: `${t.emoji} ${t.label}` }),
          h(
            "div",
            { class: "bataille__members" },
            ...b.teams[i as 0 | 1].flatMap((id) => {
              const p = room.players.find((x) => x.id === id);
              return p ? [h("span", { class: `bataille__member${id === this.meId ? " is-me" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } }, playerAvatar(p, { size: 36 }), h("small", { text: p.name }))] : [];
            }),
          ),
        ),
      );
    });
    this.info.append(teams, h("p", { class: "muted", text: `Amenez le foulard jusqu'à votre camp : encore ${b.goal + b.rope} cran(s) pour le Soleil, ${b.goal - b.rope} pour la Lune.` }));
  }
}
