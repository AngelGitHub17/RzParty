import { DIFFICULTIES, defisMultiplier, type DefisState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, h } from "../ui/dom.ts";
import { with3D } from "./modeKit.ts";
import type { DefisScene } from "../three/defisScene.ts";

/** Mode « Défis », entre deux mini-jeux : score de l'équipe, cœurs, série, puis tableau des records. */
export class DefisView {
  private readonly el: HTMLElement;
  private readonly stage3d = h("div", { class: "salon__3d" });
  private readonly info = h("div", { class: "salon__stage" });
  private scene: DefisScene | null = null;
  private room: RoomSnapshot | null = null;
  private gone = false;

  constructor(root: HTMLElement, layout: ViewLayout, _meId: string | null) {
    this.el = h("section", { class: `salon salon--defis salon--${layout} salon--wide` }, h("div", { class: "salon__main" }, this.stage3d, this.info));
    root.append(this.el);
    with3D(this.stage3d, () => import("../three/defisScene.ts"), ({ DefisScene }, host) => {
      if (this.gone) return false;
      this.scene = new DefisScene(host, layout !== "tv");
      const d = this.room?.game?.defis;
      if (d && this.room) this.scene.update(d, this.room.players);
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
    const d = room.game?.defis;
    if (!d) return;
    this.scene?.update(d, room.players);
    this.render(d, room);
  }

  private render(d: DefisState, room: RoomSnapshot): void {
    clear(this.info);
    const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? "?";
    const hearts = "❤️".repeat(Math.max(0, d.hearts)) + "🖤".repeat(Math.max(0, d.maxHearts - d.hearts));
    this.info.append(h("div", { class: "defis__score" }, h("strong", { text: `${d.score} pts` }), h("span", { text: hearts })));
    if (d.phase === "done") {
      this.info.append(h("p", { class: "salon__big", text: d.place === 0 ? "🏆 Nouveau record de l'équipe !" : d.place !== null && d.place > 0 ? `Bravo : ${d.place + 1}ᵉ meilleur score !` : "Partie terminée !" }));
      const list = h("ol", { class: "defis__records" });
      for (const r of d.records) list.append(h("li", { class: r.score === d.score && d.place !== null && d.place >= 0 ? "is-new" : "" }, h("strong", { text: `${r.score} pts` }), h("span", { text: r.names.join(", ") })));
      if (d.records.length) this.info.append(h("p", { class: "muted", text: "Meilleurs scores" }), list);
      return;
    }
    if (d.last) {
      this.info.append(
        d.last.ok
          ? h("p", { class: "solo__ok", text: `Défi réussi ! +${d.last.points} pts (${d.last.ahead.map(name).join(", ")} devant les bots, ×${String(d.last.multiplier).replace(".", ",")})` })
          : h("p", { class: "salon__oops", text: "Défi raté : les bots ont gagné… un cœur en moins !" }),
      );
    }
    const bots = room.players.filter((p) => p.isBot).length;
    this.info.append(
      h("p", { class: "salon__big", text: `Défi ${d.round + 1} : finissez devant le meilleur bot !` }),
      h("p", { class: "muted", text: bots ? `Bots niveau ${DIFFICULTIES[d.level].label.toLowerCase()} · prochain défi réussi : ×${String(defisMultiplier(d.streak)).replace(".", ",")}` : "Ajoute au moins un bot dans le salon : ce sont vos adversaires !" }),
    );
    if (d.records[0]) this.info.append(h("p", { class: "muted", text: `Record à battre : ${d.records[0].score} pts (${d.records[0].names.join(", ")})` }));
  }
}
