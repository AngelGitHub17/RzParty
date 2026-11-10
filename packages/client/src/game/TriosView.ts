import { PLAYER_COLORS, TRIO_JOKER, normalizeAvatar, trioRows, type PublicPlayer, type RoomSnapshot, type TrioChar, type TriosState } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { avatarSvg, playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction, with3D } from "./modeKit.ts";
import type { TriosScene } from "../three/triosScene.ts";

/** Un personnage : couleur cachée (« ? »), joker (arc-en-ciel) ou normal. */
export function charTile(c: TrioChar, size: number, cls = ""): HTMLElement {
  return h(
    "span",
    { class: `char${c.color === null ? " is-hidden" : ""}${c.color === TRIO_JOKER ? " is-joker" : ""}${cls ? ` ${cls}` : ""}` },
    avatarSvg(normalizeAvatar(c.avatar), { size }),
    c.color === null ? h("b", { class: "char__badge", text: "?" }) : null,
  );
}

/** Mode « Trios » : le centre, mon plateau (2 rangées de 3), ceux des autres. */
export class TriosView {
  private readonly el: HTMLElement;
  private scene: TriosScene | null = null;
  private destroyed = false;
  private readonly stage3d = h("div", { class: "mode-stage3d" });
  private readonly head = h("div", { class: "trios__head" });
  private readonly text = h("p", { class: "trios__text", attrs: { "aria-live": "polite" } });
  private readonly center = h("div", { class: "trios__center" });
  private readonly actions = h("div", { class: "trios__actions" });
  private readonly mine = h("div", { class: "trios__mine" });
  private readonly others = h("div", { class: "trios__others" });
  private readonly table = h("div", {});
  private room: RoomSnapshot | null = null;
  /** Personnage du centre que je viens de sélectionner (avant de choisir sa place). */
  private selected: number | null = null;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `trios trios--${layout}` },
      h("div", { class: "trios__main" }, this.head, this.text, this.stage3d, this.center, this.actions, layout !== "tv" && meId ? this.mine : null, layout === "pad" ? null : this.others),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table),
    );
    root.append(this.el);
    with3D(this.stage3d, () => import("../three/triosScene.ts"), ({ TriosScene }, host) => {
      if (this.destroyed) return false;
      this.scene = new TriosScene(host, layout, meId, { onCenter: (i) => this.pickCenter(i), onSlot: (slot) => void this.pickSlot(slot) });
      this.el.classList.add("is-3d");
      if (this.room) this.update(this.room);
      return true;
    });
    this.stop = everyFrame(() => this.tick());
  }

  destroy(): void {
    this.destroyed = true;
    this.scene?.destroy();
    this.stop();
    this.el.remove();
  }

  private myTurn(t: TriosState): boolean {
    return this.layout !== "tv" && this.meId !== null && t.turn === this.meId;
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const t = room.game?.trios;
    if (!t) return;
    if (!this.myTurn(t) || (this.selected !== null && !t.center[this.selected])) this.selected = null;
    clear(this.head);
    this.head.append(h("strong", { text: `Tour ${Math.max(1, t.round)}/${t.rounds}` }), h("span", { class: "muted", text: "Rangée de 3 : 3 pts · Double trio : 10 pts" }));
    this.renderCenter(t);
    this.scene?.update(t, room.players, this.selected, this.myTurn(t));
    this.renderActions(t);
    if (this.meId && this.layout !== "tv") this.renderPlatform(this.mine, t, this.meId, room.players, true);
    if (this.layout !== "pad") {
      clear(this.others);
      for (const id of t.order) {
        if (id === this.meId && this.layout === "solo") continue;
        const box = h("div", {});
        this.renderPlatform(box, t, id, room.players, false);
        this.others.append(box);
      }
    }
    clear(this.table);
    this.table.append(scoreTable(room.players, Object.keys(t.scores), (id) => t.scores[id] ?? 0, (id) => `${t.scores[id] ?? 0} pt${(t.scores[id] ?? 0) > 1 ? "s" : ""}`, { meId: this.meId, highlight: t.turn }));
  }

  /** Choix d'un personnage du centre (bouton ou toucher en 3D). */
  private pickCenter(i: number): void {
    const t = this.room?.game?.trios;
    if (!t || !this.myTurn(t)) return;
    this.selected = this.selected === i ? null : i;
    if (this.room) this.update(this.room);
  }

  /** Place à remplacer chez moi, une fois un personnage du centre choisi. */
  private async pickSlot(slot: number): Promise<void> {
    const center = this.selected;
    this.selected = null;
    if (center !== null) await sendAction({ type: "trio", center, slot });
  }

  private renderCenter(t: TriosState): void {
    clear(this.center);
    this.center.hidden = !t.center.length;
    const mine = this.myTurn(t);
    t.center.forEach((c, i) => {
      if (!c) {
        this.center.append(h("span", { class: "trios__slot is-empty" }));
        return;
      }
      const tile = charTile(c, this.layout === "pad" ? 58 : 72);
      this.center.append(
        mine
          ? h(
              "button",
              {
                class: `trios__slot${this.selected === i ? " is-selected" : ""}`,
                attrs: { type: "button", "aria-label": c.color === null ? "Personnage mystère" : "Prendre ce personnage" },
                on: { click: () => this.pickCenter(i) },
              },
              tile,
            )
          : h("span", { class: "trios__slot" }, tile),
      );
    });
  }

  private renderActions(t: TriosState): void {
    clear(this.actions);
    if (!this.myTurn(t)) return;
    this.actions.append(
      h("button", {
        class: "btn btn--ghost btn--small",
        attrs: { type: "button" },
        text: "Passer mon tour",
        on: { click: () => void sendAction({ type: "trio", center: null }) },
      }),
    );
  }

  private renderPlatform(box: HTMLElement, t: TriosState, id: string, players: PublicPlayer[], mine: boolean): void {
    const p = players.find((x) => x.id === id);
    const chars = t.platforms[id];
    if (!p || !chars) return;
    const rows = trioRows(chars.map((c) => c.color));
    const scored = t.phase === "score" ? t.scored.find((s) => s.playerId === id) : undefined;
    const placing = mine && this.myTurn(t) && this.selected !== null;
    const size = mine ? (this.layout === "pad" ? 62 : 70) : 40;
    clear(box);
    box.className = `trios__plat${mine ? " is-mine" : ""}${t.turn === id ? " is-turn" : ""}${scored ? " is-scored" : ""}`;
    box.style.setProperty("--player", PLAYER_COLORS[p.color]?.hex ?? "#999");
    box.append(
      h("div", { class: "trios__plat-head" }, playerAvatar(p, { size: mine ? 30 : 24 }), h("span", { text: mine ? "Mes personnages" : p.name }), scored ? h("strong", { text: `+${scored.points}` }) : null),
      ...[0, 1].map((r) =>
        h(
          "div",
          { class: `trios__row${rows.includes(r) ? " is-trio" : ""}` },
          ...chars.slice(r * 3, r * 3 + 3).map((c, k) => {
            const slot = r * 3 + k;
            const fresh = t.lastSwap?.playerId === id && t.lastSwap.slot === slot;
            const tile = charTile(c, size, fresh ? "is-new" : "");
            return placing
              ? h(
                  "button",
                  {
                    class: "trios__cell is-target",
                    attrs: { type: "button", "aria-label": `Mettre à la place ${slot + 1}` },
                    on: { click: () => void this.pickSlot(slot) },
                  },
                  tile,
                )
              : h("span", { class: "trios__cell" }, tile);
          }),
        ),
      ),
    );
  }

  private tick(): void {
    const t = this.room?.game?.trios;
    if (!t) return;
    const left = t.endsAt ? Math.max(0, Math.ceil((t.endsAt - serverNow()) / 1000)) : 0;
    const who = this.room!.players.find((p) => p.id === t.turn)?.name ?? "";
    if (t.phase === "score") this.text.textContent = t.scored.length ? "Fin du tour : les trios rapportent des points !" : "Fin du tour : pas de trio cette fois.";
    else if (!t.turn) this.text.textContent = t.round ? "Chacun son tour au centre…" : "Préparez vos rangées : 3 de la même couleur !";
    else if (this.myTurn(t)) this.text.textContent = this.selected === null ? `À toi ! Touche un personnage au centre (${left} s)` : `Touche le personnage à remplacer chez toi (${left} s)`;
    else this.text.textContent = `${who} choisit au centre… ${left ? `(${left} s)` : ""}`;
  }
}
