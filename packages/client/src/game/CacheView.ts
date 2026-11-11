import { cacheRingOffset, CACHE_TIMINGS, type CacheState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction } from "./modeKit.ts";
import { hiddenRing, keepAwake, success } from "./sfx.ts";
import { secondsLeft, soundGate, whoAmI } from "./salonKit.ts";

/**
 * Mode « Cache-cache ». Sur l'écran commun : le cacheur, le temps, les téléphones trouvés.
 * Sur chaque téléphone : « Caché ! » quand le cacheur l'a posé, puis la sonnerie toutes les 10 secondes
 * et « Trouvé ! » pour celui qui le déniche.
 */
export class CacheView {
  private readonly el: HTMLElement;
  private readonly head = h("div", { class: "salon__head" });
  private readonly timer = h("div", { class: "salon__timer" });
  private readonly stageBox = h("div", { class: "salon__stage" });
  private readonly action = h("div", { class: "salon__action" });
  private readonly table = h("div", {});
  private readonly gate: { refresh(): void } | null = null;
  private room: RoomSnapshot | null = null;
  private picking = false;
  private lastRing = -1;
  private foundCount = 0;
  private stop: () => void;
  private release: () => void = () => {};

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    const main = h("div", { class: "salon__main" }, this.head, this.timer, this.stageBox, this.action);
    this.el = h("section", { class: `salon salon--cache salon--${layout}` }, main, layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table));
    root.append(this.el);
    if (this.isDevice()) {
      this.gate = soundGate(main);
      this.release = keepAwake();
    }
    this.stop = everyFrame(() => this.tick());
  }

  private isDevice(): boolean {
    return this.layout !== "tv" && this.meId !== null;
  }

  destroy(): void {
    this.stop();
    this.release();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const c = room.game?.cache;
    if (!c) return;
    if (c.phase !== "seek") this.picking = false;
    const found = Object.keys(c.found).length;
    if (found > this.foundCount && c.phase === "seek") success();
    this.foundCount = c.phase === "seek" ? found : 0;
    // Le téléphone caché devient tout noir (discret) : seul le bouton « Trouvé » se voit en le touchant.
    this.el.classList.toggle("is-hidden-phone", this.isDevice() && this.inHiding(c));
    clear(this.head);
    this.head.append(h("small", { text: `Tour ${c.tour}/${c.tours} · manche ${c.round}` }));
    this.renderStage(c, room);
    this.renderAction(c, room);
    clear(this.table);
    this.table.append(scoreTable(room.players, Object.keys(c.scores), (id) => c.scores[id] ?? 0, (id) => `${c.scores[id] ?? 0} pt${(c.scores[id] ?? 0) > 1 ? "s" : ""}`, { meId: this.meId, highlight: c.hider }));
    this.gate?.refresh();
  }

  /** Ce téléphone est caché quelque part (pendant la cachette ou la recherche, tant qu'on ne l'a pas trouvé). */
  private inHiding(c: CacheState): boolean {
    const me = this.meId!;
    if (!c.devices.includes(me)) return false;
    return (c.phase === "hide" && c.hidden.includes(me)) || (c.phase === "seek" && !c.found[me]);
  }

  private tick(): void {
    const c = this.room?.game?.cache;
    if (!c) return;
    const left = secondsLeft(c.endsAt);
    this.timer.textContent = left === null || c.phase === "reveal" ? "" : `⏱ ${left} s`;
    if (!this.isDevice() || c.phase !== "seek" || c.seekAt === null || c.found[this.meId!]) return;
    const index = c.devices.indexOf(this.meId!);
    if (index < 0) return;
    // Sonnerie toutes les 10 secondes, décalée d'un téléphone à l'autre.
    const k = Math.floor((serverNow() - c.seekAt - cacheRingOffset(index, c.devices.length) - 1500) / CACHE_TIMINGS.ring);
    if (k >= 0 && k !== this.lastRing) {
      this.lastRing = k;
      hiddenRing();
    }
  }

  private name(room: RoomSnapshot, id: string | null): string {
    return room.players.find((p) => p.id === id)?.name ?? "?";
  }

  private renderStage(c: CacheState, room: RoomSnapshot): void {
    clear(this.stageBox);
    const hider = room.players.find((p) => p.id === c.hider);
    const iHide = c.hider === this.meId;
    switch (c.phase) {
      case "wait":
        this.stageBox.append(h("p", { class: "salon__big", text: "Il faut au moins 2 téléphones connectés pour jouer…" }));
        return;
      case "intro":
        if (hider) this.stageBox.append(playerAvatar(hider, { size: 96 }));
        this.stageBox.append(
          h("p", { class: "salon__big", text: iHide ? "C'est toi qui caches ! Ramasse tous les téléphones." : `${this.name(room, c.hider)} va cacher les téléphones !` }),
          h("p", { class: "muted", text: iHide ? "Les autres sortent de la pièce ou ferment les yeux." : "Laisse ton téléphone sur la table, puis sors de la pièce ou ferme les yeux !" }),
        );
        return;
      case "hide":
        this.stageBox.append(
          h("div", { class: "salon__emoji", text: "🙈" }),
          h("p", { class: "salon__big", text: `${this.name(room, c.hider)} cache les téléphones… (${c.hidden.length}/${c.devices.length})` }),
          h("p", { class: "muted", text: "Touche « Caché ! » sur chaque téléphone une fois posé. Pas dans un endroit où il pourrait s'abîmer !" }),
        );
        return;
      case "seek": {
        const found = Object.keys(c.found).length;
        this.stageBox.append(
          h("div", { class: "salon__emoji", text: "🔎" }),
          h("p", { class: "salon__big", text: `Cherchez ! ${found}/${c.devices.length} téléphones trouvés` }),
          h("p", { class: "muted", text: "Chaque téléphone caché sonne toutes les 10 secondes. Tendez l'oreille !" }),
          h(
            "div",
            { class: "salon__found" },
            ...c.devices.map((d) => {
              const owner = room.players.find((p) => p.id === d);
              const by = c.found[d] ? room.players.find((p) => p.id === c.found[d]) : null;
              return h("div", { class: `salon__phone${by ? " is-found" : ""}` }, h("span", { text: "📱" }), h("small", { text: owner?.name ?? "?" }), by ? h("small", { text: `✔ ${by.name}` }) : h("small", { text: "?" }));
            }),
          ),
        );
        return;
      }
      case "reveal": {
        const l = c.last;
        if (!l) return;
        this.stageBox.append(
          h("div", { class: "salon__emoji", text: l.seekersWin ? "🎉" : "😏" }),
          h("p", { class: "salon__big", text: l.seekersWin ? `Tous trouvés ! Les chercheurs gagnent la manche (+1 chacun).` : `${l.found}/${l.total} trouvés : ${this.name(room, l.hider)} gagne la manche (+2 par téléphone resté caché) !` }),
        );
        if (!l.seekersWin) this.stageBox.append(h("p", { class: "muted", text: "N'oubliez pas de récupérer les téléphones encore cachés 😉" }));
        return;
      }
      case "done":
        return;
    }
  }

  private renderAction(c: CacheState, room: RoomSnapshot): void {
    clear(this.action);
    if (!this.isDevice()) return;
    const me = this.meId!;
    if (c.phase === "intro" && c.hider === me) {
      this.action.append(h("button", { class: "btn btn--go btn--big", attrs: { type: "button" }, text: "C'est parti, je cache !", on: { click: () => void sendAction({ type: "skip" }) } }));
      return;
    }
    if (c.phase === "hide" && c.devices.includes(me)) {
      if (c.hidden.includes(me)) {
        this.action.append(h("p", { class: "salon__shh", text: "Chut… je suis caché 🤫" }));
        if (c.hider === me) this.action.append(h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "J'ai fini de cacher", on: { click: () => void sendAction({ type: "skip" }) } }));
      } else this.action.append(h("button", { class: "btn btn--go btn--big salon__grab", attrs: { type: "button" }, text: "🙈 Caché !", on: { click: () => void sendAction({ type: "hidden" }) } }));
      return;
    }
    if (c.phase !== "seek" || !c.devices.includes(me)) return;
    const by = c.found[me];
    if (by) {
      this.action.append(h("p", { class: "salon__big", text: `Trouvé par ${this.name(room, by)} ! Rapporte-moi sur la table.` }));
      return;
    }
    if (this.picking) {
      const seekers = room.players.filter((p) => !p.isBot && p.id in c.scores && p.id !== c.hider);
      this.action.append(
        whoAmI(
          "Qui m'a trouvé ? Touche ton visage :",
          seekers,
          (id) => {
            this.picking = false;
            void sendAction({ type: "found", by: id });
          },
          () => {
            this.picking = false;
            if (this.room) this.update(this.room);
          },
        ),
      );
      return;
    }
    this.action.append(
      h("p", { class: "salon__shh", text: "Chut… je suis caché 🤫" }),
      h("button", {
        class: "btn btn--go btn--big salon__grab",
        attrs: { type: "button" },
        text: "🔎 Trouvé !",
        on: {
          click: () => {
            this.picking = true;
            if (this.room) this.update(this.room);
          },
        },
      }),
    );
  }
}
