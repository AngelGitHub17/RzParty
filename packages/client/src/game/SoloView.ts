import { DIFFICULTIES, type RoomSnapshot, type SoloState } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { with3D } from "./modeKit.ts";
import type { SoloScene } from "../three/soloScene.ts";

/** Mode « Parcours solo », entre deux étapes : la carte, l'étape à jouer et les vies. */
export class SoloView {
  private readonly el: HTMLElement;
  private readonly stage3d = h("div", { class: "salon__3d" });
  private readonly info = h("div", { class: "salon__stage" });
  private scene: SoloScene | null = null;
  private room: RoomSnapshot | null = null;
  private gone = false;

  constructor(root: HTMLElement, layout: ViewLayout, private readonly meId: string | null) {
    this.el = h("section", { class: `salon salon--solo-mode salon--${layout} salon--wide` }, h("div", { class: "salon__main" }, this.stage3d, this.info));
    root.append(this.el);
    with3D(this.stage3d, () => import("../three/soloScene.ts"), ({ SoloScene }, host) => {
      if (this.gone) return false;
      this.scene = new SoloScene(host, layout !== "tv");
      const s = this.room?.game?.solo;
      if (s && this.room) this.scene.update(s, this.room.players);
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
    const s = room.game?.solo;
    if (!s) return;
    this.scene?.update(s, room.players);
    this.render(s, room);
  }

  private render(s: SoloState, room: RoomSnapshot): void {
    clear(this.info);
    const bots = room.players.filter((p) => p.isBot).length;
    const goal = s.needed === 1 ? "il faut gagner" : `il faut finir dans les ${s.needed} premiers`;
    this.info.append(
      h("p", { class: "salon__big", text: `Étape ${s.stage}/${s.stages} : ${goal} !` }),
      h("p", { class: "muted", text: bots ? `Adversaires : ${bots} bot${bots > 1 ? "s" : ""}, niveau ${DIFFICULTIES[s.level].label.toLowerCase()}.` : "Ajoute au moins un bot dans le salon pour avoir des adversaires." }),
    );
    if (s.last && (s.last.passed.length || s.last.failed.length)) {
      const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? "?";
      if (s.last.passed.length) this.info.append(h("p", { class: "solo__ok", text: `✔ Étape franchie : ${s.last.passed.map(name).join(", ")}` }));
      if (s.last.failed.length) this.info.append(h("p", { class: "salon__oops", text: `💔 Une vie en moins : ${s.last.failed.map(name).join(", ")}` }));
    }
    const list = h("div", { class: "solo__players" });
    for (const id of Object.keys(s.progress)) {
      const p = room.players.find((x) => x.id === id);
      if (!p) continue;
      const lives = s.lives[id] ?? 0;
      list.append(
        h(
          "div",
          { class: `solo__player${id === this.meId ? " is-me" : ""}${lives <= 0 ? " is-out" : ""}` },
          playerAvatar(p, { size: 40 }),
          h("strong", { text: p.name }),
          h("span", { text: `Étape ${s.progress[id] ?? 0}/${s.stages}` }),
          h("span", { class: "solo__lives", text: lives > 0 ? "❤️".repeat(lives) : "Plus de vies" }),
        ),
      );
    }
    this.info.append(list);
  }
}
