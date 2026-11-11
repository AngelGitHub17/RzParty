import { type LibreState, type RoomSnapshot } from "@rzparty/shared";
import { MINI_GAME_DEFINITIONS } from "@rzparty/minigames/catalog";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, h } from "../ui/dom.ts";
import { scoreTable, sendAction } from "./modeKit.ts";

/** Familles de mini-jeux, pour ranger la liste. */
const CATEGORY_LABEL: Record<string, string> = {
  reflexes: "⚡ Réflexes",
  memoire: "🧠 Mémoire",
  frappe: "👆 Frappe",
  calcul: "➗ Calcul",
  logique: "🧩 Logique",
  labyrinthe: "🌀 Labyrinthes",
  chaines: "⛓️ Enchaînements",
  bombe: "💣 Bombes",
};

/**
 * Mode « Jeu libre », entre deux mini-jeux : le chef choisit le suivant dans la liste (ou au hasard).
 */
export class LibreView {
  private readonly el: HTMLElement;
  private readonly head = h("div", { class: "salon__head" });
  private readonly stageBox = h("div", { class: "salon__stage libre__stage" });
  private readonly table = h("div", {});
  private key = "";

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    const main = h("div", { class: "salon__main" }, this.head, this.stageBox);
    this.el = h("section", { class: `salon salon--libre salon--${layout}` }, main, layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table));
    root.append(this.el);
  }

  destroy(): void {
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    const s = room.game?.libre;
    if (!s) return;
    clear(this.head);
    this.head.append(h("small", { text: `Manche ${Math.min(s.round + 1, s.rounds)}/${s.rounds}` }));
    clear(this.table);
    this.table.append(scoreTable(room.players, Object.keys(s.scores), (id) => s.scores[id] ?? 0, (id) => `${s.scores[id] ?? 0} pt${(s.scores[id] ?? 0) > 1 ? "s" : ""}`, { meId: this.meId }));
    const chef = room.players.find((p) => p.isChef);
    const iChoose = this.layout !== "tv" && chef?.id === this.meId;
    // On ne redessine la liste que si elle change (sinon le défilement repart en haut).
    const key = `${s.round}:${iChoose}:${s.choices.join(",")}`;
    if (key === this.key) return;
    this.key = key;
    this.render(s, iChoose, chef?.name ?? "Le chef");
  }

  private render(s: LibreState, iChoose: boolean, chefName: string): void {
    clear(this.stageBox);
    if (!iChoose) {
      this.stageBox.append(h("div", { class: "salon__emoji", text: "🎮" }), h("p", { class: "salon__big", text: `${chefName} choisit le prochain mini-jeu…` }));
      return;
    }
    this.stageBox.append(
      h("p", { class: "salon__big", text: "Choisis le prochain mini-jeu !" }),
      h("button", { class: "btn btn--go", attrs: { type: "button" }, text: "🎲 Au hasard", on: { click: () => void sendAction({ type: "pick", game: "hasard" }) } }),
    );
    const games = MINI_GAME_DEFINITIONS.filter((d) => s.choices.includes(d.id));
    const groups = new Map<string, typeof games>();
    for (const g of games) groups.set(g.category, [...(groups.get(g.category) ?? []), g]);
    for (const [cat, list] of groups) {
      this.stageBox.append(
        h("h3", { class: "libre__cat", text: CATEGORY_LABEL[cat] ?? cat }),
        h(
          "div",
          { class: "libre__grid" },
          ...list.map((g) =>
            h(
              "button",
              { class: `libre__game${s.played.includes(g.id) ? " is-played" : ""}`, attrs: { type: "button", title: g.rules }, on: { click: () => void sendAction({ type: "pick", game: g.id }) } },
              h("img", { attrs: { src: `/site/mg/${g.id}.webp`, alt: "", loading: "lazy" } }),
              h("strong", { text: g.name }),
              s.played.includes(g.id) ? h("small", { text: "✔ déjà joué" }) : null,
            ),
          ),
        ),
      );
    }
  }
}
