import { LOTO_LINES, PLAYER_COLORS, normalizeAvatar, type LotoState, type PublicPlayer, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { avatarSvg, playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction } from "./modeKit.ts";

/** Nombre de cases manquantes pour la ligne la plus avancée. */
function missing(marked: boolean[]): number {
  return Math.min(...LOTO_LINES.map((l) => l.filter((i) => !marked[i]).length));
}

/** Mode « Loto des copains » : la boule tirée, mon carton, l'avancée des autres. */
export class LotoView {
  private readonly el: HTMLElement;
  private readonly ball = h("div", { class: "loto__ball", attrs: { "aria-live": "polite" } });
  private readonly info = h("p", { class: "loto__info" });
  private readonly card = h("div", { class: "loto__card" });
  private readonly others = h("div", { class: "loto__others" });
  private readonly table = h("div", {});
  private shownBall = -1;
  private room: RoomSnapshot | null = null;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    const mine = layout !== "tv" && meId !== null;
    this.el = h(
      "section",
      { class: `loto loto--${layout}` },
      h("div", { class: "loto__main" }, this.ball, this.info, mine ? this.card : null, layout === "pad" ? null : this.others),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table),
    );
    root.append(this.el);
    this.stop = everyFrame(() => this.tick());
  }

  destroy(): void {
    this.stop();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const l = room.game?.loto;
    if (!l) return;
    this.renderBall(l);
    this.renderCard(l);
    this.renderOthers(l, room.players);
    clear(this.table);
    const ids = Object.keys(l.cards);
    this.table.append(scoreTable(room.players, ids, (id) => -missing(l.marked[id]!), (id) => (missing(l.marked[id]!) === 0 ? "LIGNE !" : `encore ${missing(l.marked[id]!)}`), { meId: this.meId }));
  }

  private renderBall(l: LotoState): void {
    if (l.ballId === this.shownBall && this.ball.childElementCount) return;
    this.shownBall = l.ballId;
    clear(this.ball);
    this.ball.classList.remove("is-new", "is-minigame");
    void this.ball.offsetWidth;
    this.ball.classList.add("is-new");
    if (!l.ball) this.ball.append(h("span", { text: "?" }));
    else if (l.ball.kind === "minijeu") {
      this.ball.classList.add("is-minigame");
      this.ball.append(h("strong", { text: "Mini-jeu !" }));
    } else this.ball.append(avatarSvg(normalizeAvatar(l.pool[l.ball.index]), { size: 110 }));
  }

  private renderCard(l: LotoState): void {
    if (!this.meId || this.layout === "tv") return;
    const card = l.cards[this.meId];
    const marked = l.marked[this.meId];
    if (!card || !marked) return;
    const picking = l.phase === "pick" && l.pickers.includes(this.meId);
    this.card.classList.toggle("is-picking", picking);
    clear(this.card);
    card.forEach((n, i) => {
      const cell = h(
        picking && !marked[i] ? "button" : "div",
        {
          class: `loto__cell${marked[i] ? " is-marked" : ""}${l.ball?.kind === "perso" && l.ball.index === n ? " is-new" : ""}`,
          attrs: picking && !marked[i] ? { type: "button", "aria-label": `Cocher la case ${i + 1}` } : {},
          on: picking && !marked[i] ? { click: () => void sendAction({ type: "mark", cell: i }) } : {},
        },
        n === -1 ? h("span", { class: "loto__free", text: "★" }) : avatarSvg(normalizeAvatar(l.pool[n]), { size: this.layout === "pad" ? 50 : 62 }),
      );
      this.card.append(cell);
    });
  }

  private renderOthers(l: LotoState, players: PublicPlayer[]): void {
    if (this.layout === "pad") return;
    clear(this.others);
    for (const [id, marked] of Object.entries(l.marked)) {
      if (id === this.meId && this.layout === "solo") continue;
      const p = players.find((x) => x.id === id);
      if (!p) continue;
      this.others.append(
        h(
          "div",
          { class: `loto__mini${l.pickers.includes(id) ? " is-picking" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
          h("div", { class: "loto__mini-head" }, playerAvatar(p, { size: 26 }), h("span", { text: p.name })),
          h("div", { class: "loto__dots" }, ...marked.map((m) => h("span", { class: m ? "is-on" : "" }))),
        ),
      );
    }
  }

  private tick(): void {
    const l = this.room?.game?.loto;
    if (!l) return;
    if (l.phase === "pick") {
      const left = l.endsAt ? Math.max(0, Math.ceil((l.endsAt - serverNow()) / 1000)) : 0;
      const me = this.meId && l.pickers.includes(this.meId);
      this.info.textContent = me ? `Tu as gagné le mini-jeu : touche la case de ton choix ! (${left} s)` : "Les gagnants du mini-jeu choisissent une case…";
    } else {
      this.info.textContent = l.ball?.kind === "minijeu" ? "Boule Mini-jeu : le gagnant cochera la case de son choix !" : `Boule n°${l.drawn.length} · première ligne complète (rangée, colonne ou diagonale) gagne`;
    }
  }
}
