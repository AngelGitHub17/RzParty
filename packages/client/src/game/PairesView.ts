import { PLAYER_COLORS, normalizeAvatar, type PairesState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { avatarSvg, playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction, with3D } from "./modeKit.ts";
import type { PairesScene } from "../three/pairesScene.ts";

/** Mode « Paires cachées » : la place et ses 24 personnages, les cœurs du joueur en cours. */
export class PairesView {
  private readonly el: HTMLElement;
  private scene: PairesScene | null = null;
  private destroyed = false;
  private readonly stage3d = h("div", { class: "mode-stage3d" });
  private readonly head = h("div", { class: "cache__head" });
  private readonly text = h("p", { class: "cache__text", attrs: { "aria-live": "polite" } });
  private readonly grid = h("div", { class: "cache__grid" });
  private readonly table = h("div", {});
  private room: RoomSnapshot | null = null;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `cache cache--${layout}` },
      h("div", { class: "cache__main" }, this.head, this.text, this.stage3d, this.grid),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table),
    );
    root.append(this.el);
    with3D(this.stage3d, () => import("../three/pairesScene.ts"), ({ PairesScene }, host) => {
      if (this.destroyed) return false;
      this.scene = new PairesScene(host, (card) => void sendAction({ type: "flip", card }));
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

  private myTurn(s: PairesState): boolean {
    return this.layout !== "tv" && this.meId !== null && s.turn === this.meId && s.phase === "flip";
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const s = room.game?.paires;
    if (!s) return;
    this.scene?.update(s, room.players, this.myTurn(s));
    const who = room.players.find((p) => p.id === s.turn);
    clear(this.head);
    this.head.append(
      h("strong", { text: `Tour ${s.tour}/${s.tours}` }),
      ...(who ? [playerAvatar(who, { size: 30 }), h("span", { text: who.name })] : []),
      h("span", { class: "cache__hearts", attrs: { "aria-label": `${s.hearts} cœur${s.hearts > 1 ? "s" : ""}` }, text: "❤".repeat(Math.max(0, s.hearts)) || "💔" }),
      h("span", { class: "muted", text: `${s.cards.filter((c) => c.found === null).length / 2} paires à trouver` }),
    );
    clear(this.grid);
    const mine = this.myTurn(s);
    const size = this.layout === "pad" ? 40 : 56;
    s.cards.forEach((c, i) => {
      const finder = c.found ? room.players.find((p) => p.id === c.found) : undefined;
      const open = c.found === null && s.flipped.includes(i);
      const live = mine && c.found === null && !open;
      this.grid.append(
        h(
          live ? "button" : "div",
          {
            class: `cache__card${c.found ? " is-found" : ""}${open ? " is-open" : ""}${c.moved ? " is-moved" : ""}${open && s.last === "paire" ? " is-pair" : ""}${open && s.last === "rate" ? " is-miss" : ""}`,
            style: finder ? { "--player": PLAYER_COLORS[finder.color]?.hex } : {},
            attrs: live ? { type: "button", "aria-label": `Retourner le personnage ${i + 1}` } : {},
            on: live ? { click: () => void sendAction({ type: "flip", card: i }) } : {},
          },
          avatarSvg(normalizeAvatar(c.avatar), { size }),
          c.color === null ? h("b", { class: "char__badge", text: "?" }) : null,
        ),
      );
    });
    clear(this.table);
    this.table.append(
      scoreTable(room.players, Object.keys(s.scores), (id) => s.scores[id] ?? 0, (id) => `${s.scores[id] ?? 0} paire${(s.scores[id] ?? 0) > 1 ? "s" : ""}${s.bonus[id] ? ` · +${s.bonus[id]} ❤` : ""}`, { meId: this.meId, highlight: s.turn }),
    );
  }

  private tick(): void {
    const s = this.room?.game?.paires;
    if (!s) return;
    const left = s.endsAt ? Math.max(0, Math.ceil((s.endsAt - serverNow()) / 1000)) : 0;
    const who = this.room!.players.find((p) => p.id === s.turn)?.name ?? "";
    if (s.phase === "show") this.text.textContent = s.last === "paire" ? "Une paire ! On rejoue." : s.hearts > 0 ? "Raté… encore un cœur, on continue !" : "Raté ! La main passe.";
    else if (!s.turn) this.text.textContent = "Retiens bien les couleurs !";
    else if (this.myTurn(s)) this.text.textContent = `À toi ! ${s.flipped.length ? "Trouve le même" : "Retourne un personnage"} (${left} s)`;
    else this.text.textContent = s.cards.some((c) => c.moved) && !s.flipped.length ? `Attention, deux personnages ont bougé ! ${who} joue…` : `${who} cherche une paire…`;
  }
}
