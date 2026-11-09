import { LOTO_SIZE, PLAYER_COLORS, lotoMissing, normalizeAvatar, type LotoState, type PublicPlayer, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { avatarSvg, playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction } from "./modeKit.ts";

/** Mode « Bingo des copains » : choix des grilles, la boule tirée, ma grille, l'avancée des autres. */
export class LotoView {
  private readonly el: HTMLElement;
  private readonly ball = h("div", { class: "loto__ball", attrs: { "aria-live": "polite" } });
  private readonly machine = h("p", { class: "loto__machine" });
  private readonly info = h("p", { class: "loto__info" });
  private readonly timer = h("div", { class: "loto__timer" }, h("span"));
  private readonly card = h("div", { class: "loto__card" });
  private readonly grids = h("div", { class: "loto__grids" });
  private readonly others = h("div", { class: "loto__others" });
  private readonly table = h("div", {});
  private shownBall = -1;
  private room: RoomSnapshot | null = null;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `loto loto--${layout}` },
      h("div", { class: "loto__main" }, h("div", { class: "loto__top" }, this.ball, h("div", { class: "loto__status" }, this.info, this.timer, this.machine)), this.grids, this.card, layout === "pad" ? null : this.others),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table),
    );
    root.append(this.el);
    this.stop = everyFrame(() => this.tick());
  }

  destroy(): void {
    this.stop();
    this.el.remove();
  }

  private mine(): boolean {
    return this.layout !== "tv" && this.meId !== null;
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const l = room.game?.loto;
    if (!l) return;
    const choosing = l.phase === "choose";
    this.ball.hidden = choosing;
    this.grids.hidden = !choosing;
    this.card.hidden = choosing || !this.mine();
    this.others.hidden = choosing;
    this.machine.textContent = choosing ? "" : `Dans la machine : ${l.left.faces} personnage${l.left.faces > 1 ? "s" : ""} et ${l.left.minigames} boule${l.left.minigames > 1 ? "s" : ""} Mini-jeu`;
    if (choosing) this.renderGrids(l, room.players);
    else {
      this.renderBall(l);
      this.renderCard(l);
      this.renderOthers(l, room.players);
    }
    clear(this.table);
    const ids = Object.keys(l.marked);
    this.table.append(
      scoreTable(room.players, ids, (id) => -lotoMissing(l.marked[id]!), (id) => (lotoMissing(l.marked[id]!) === 0 ? "BINGO !" : `encore ${lotoMissing(l.marked[id]!)}`), { meId: this.meId }),
    );
  }

  private face(l: LotoState, n: number, size: number): SVGElement {
    return avatarSvg(normalizeAvatar(l.pool[n]), { size });
  }

  private renderGrids(l: LotoState, players: PublicPlayer[]): void {
    clear(this.grids);
    const iChose = this.meId !== null && l.choice[this.meId] !== null && l.choice[this.meId] !== undefined;
    l.grids.forEach((grid, g) => {
      const owner = Object.entries(l.choice).find(([, c]) => c === g)?.[0];
      const p = owner ? players.find((x) => x.id === owner) : undefined;
      const canTake = this.mine() && !iChose && !owner;
      this.grids.append(
        h(
          canTake ? "button" : "div",
          {
            class: `loto__gridpick${owner ? " is-taken" : ""}${owner === this.meId ? " is-mine" : ""}`,
            style: p ? { "--player": PLAYER_COLORS[p.color]?.hex } : {},
            attrs: canTake ? { type: "button", "aria-label": `Choisir la grille ${g + 1}` } : {},
            on: canTake ? { click: () => void sendAction({ type: "grid", grid: g }) } : {},
          },
          h("strong", { text: `Grille ${g + 1}` }),
          h("div", { class: "loto__minigrid" }, ...grid.map((n) => h("span", {}, this.face(l, n, this.layout === "pad" ? 26 : 30)))),
          p ? h("span", { class: "loto__owner" }, playerAvatar(p, { size: 26 }), h("span", { text: p.name })) : null,
        ),
      );
    });
  }

  private renderBall(l: LotoState): void {
    if (l.ballId === this.shownBall && this.ball.childElementCount) return;
    this.shownBall = l.ballId;
    clear(this.ball);
    this.ball.classList.remove("is-new", "is-minigame");
    void this.ball.offsetWidth;
    if (l.ballId) this.ball.classList.add("is-new");
    if (!l.ball) this.ball.append(h("span", { text: "?" }));
    else if (l.ball.kind === "minijeu") {
      this.ball.classList.add("is-minigame");
      this.ball.append(h("strong", { text: "Mini-jeu !" }));
    } else this.ball.append(this.face(l, l.ball.index, 110));
  }

  private renderCard(l: LotoState): void {
    if (!this.mine()) return;
    const g = l.choice[this.meId!];
    const marked = l.marked[this.meId!];
    if (g === null || g === undefined || !marked) return;
    const card = l.grids[g]!;
    const picking = l.phase === "pick" && l.pickers.includes(this.meId!);
    const drawing = l.phase === "draw" && l.markable !== null;
    this.card.classList.toggle("is-picking", picking);
    this.card.style.setProperty("--size", String(LOTO_SIZE));
    clear(this.card);
    card.forEach((n, i) => {
      const live = !marked[i] && (picking || drawing);
      this.card.append(
        h(
          live ? "button" : "div",
          {
            class: `loto__cell${marked[i] ? " is-marked" : ""}${picking && !marked[i] ? " is-free" : ""}`,
            attrs: live ? { type: "button", "aria-label": `Cocher la case ${i + 1}` } : {},
            on: live ? { click: () => void sendAction({ type: "mark", cell: i }) } : {},
          },
          this.face(l, n, this.layout === "pad" ? 64 : 76),
        ),
      );
    });
  }

  private renderOthers(l: LotoState, players: PublicPlayer[]): void {
    if (this.layout === "pad") return;
    clear(this.others);
    for (const [id, marked] of Object.entries(l.marked)) {
      if (id === this.meId && this.layout === "solo") continue;
      const p = players.find((x) => x.id === id);
      const g = l.choice[id];
      if (!p || g === null || g === undefined) continue;
      const grid = l.grids[g]!;
      this.others.append(
        h(
          "div",
          { class: `loto__mini${l.pickers.includes(id) ? " is-picking" : ""}${lotoMissing(marked) === 0 ? " is-bingo" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
          h("div", { class: "loto__mini-head" }, playerAvatar(p, { size: 26 }), h("span", { text: p.name })),
          h(
            "div",
            { class: "loto__dots" },
            ...marked.map((m, i) => h("span", { class: `${m ? "is-on" : ""}${l.markable !== null && grid[i] === l.markable && !m ? " is-wanted" : ""}` })),
          ),
        ),
      );
    }
  }

  private tick(): void {
    const l = this.room?.game?.loto;
    if (!l) return;
    const left = l.endsAt ? Math.max(0, (l.endsAt - serverNow()) / 1000) : 0;
    const bar = this.timer.firstElementChild as HTMLElement;
    const total = l.phase === "draw" ? 5.5 : l.phase === "pick" ? 20 : 25;
    this.timer.hidden = !l.endsAt || left <= 0;
    bar.style.width = `${Math.min(100, (left / total) * 100)}%`;
    const me = this.meId;
    if (l.phase === "choose") {
      const chose = me !== null && l.choice[me] !== null && l.choice[me] !== undefined;
      this.info.textContent = !this.mine() ? `Chacun choisit sa grille… (${Math.ceil(left)} s)` : chose ? "Grille choisie ! On attend les autres…" : `Choisis ta grille ! (${Math.ceil(left)} s)`;
    } else if (l.phase === "pick") {
      const mePick = me !== null && l.pickers.includes(me);
      this.info.textContent = mePick ? `Tu as gagné le mini-jeu : touche la case de ton choix ! (${Math.ceil(left)} s)` : "Les gagnants du mini-jeu choisissent une case…";
    } else if (l.ball?.kind === "minijeu") {
      this.info.textContent = "Boule Mini-jeu : le gagnant cochera la case de son choix !";
    } else if (l.markable !== null && this.mine()) {
      const g = l.choice[me!];
      const pos = g !== null && g !== undefined ? l.grids[g]!.indexOf(l.markable) : -1;
      this.info.textContent = pos < 0 ? "Pas sur ta grille…" : l.marked[me!]![pos] ? "Coché !" : "Il est sur ta grille : trouve-le et touche-le vite !";
    } else {
      this.info.textContent = `Boule n°${l.drawn.length} · la première ligne de 4 (rangée, colonne ou diagonale) gagne`;
    }
  }
}
