import { CELL_INFO, ITEMS, PLAYER_COLORS, TEAMS, type BoardAction, type BoardState, type ItemId, type PublicPlayer, type RoomSnapshot } from "@rzparty/shared";
import { myItems, onMyItems } from "./boardPrivate.ts";
import { obfuscated } from "../ui/obfuscate.ts";

/** Nom des dés bonus selon leur nombre de faces. */
export const BONUS_DIE_NAMES: Record<number, string> = { 6: "dé d'or", 3: "dé d'argent", 2: "dé de bronze" };
import type { ViewLayout } from "@rzparty/minigames/client";
import { request, ServerError } from "../net/connection.ts";
import { append, clear, everyFrame, h, svg } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { toast } from "../ui/toast.ts";
import { serverNow } from "./clock.ts";
import type { BoardScene } from "../three/boardScene.ts";

export const COIN = `<svg class="coin" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#FFC83D" stroke="#B9850B" stroke-width="2"/><circle cx="10" cy="10" r="4.5" fill="none" stroke="#B9850B" stroke-width="1.6"/></svg>`;

/**
 * Le plateau pendant les tours de jeu.
 * - `tv` : la scène 3D en grand, le classement et ce qui se passe ;
 * - `solo` : la même chose, avec les commandes quand c'est ton tour ;
 * - `pad` : pas de 3D (le téléphone sert de manette) : ton état et tes commandes.
 */
export class BoardView {
  private readonly el: HTMLElement;
  private readonly stage3d: HTMLElement | null;
  private readonly banner = h("div", { class: "bv-banner", attrs: { "aria-live": "polite" } });
  private readonly dice = h("div", { class: "bv-dice", attrs: { "aria-live": "polite", hidden: true } });
  private readonly roundIntro = h("div", { class: "bv-round", attrs: { "aria-live": "polite", hidden: true } });
  private readonly effect = h("div", { class: "bv-effect", attrs: { "aria-live": "polite", hidden: true } });
  private readonly controls = h("div", { class: "bv-controls" });
  private readonly bag = h("div", { class: "bv-bag" });
  /** Dé pipé : choix de la valeur en cours. */
  private pickingPiped = false;
  private stopItems: (() => void) | null = null;
  private readonly hud = h("ol", { class: "bv-order", attrs: { "aria-label": "Ordre de jeu et classement" } });
  private readonly status = h("div", { class: "bv-status" });
  private scene: BoardScene | null = null;
  private room: RoomSnapshot | null = null;
  private rollingStop: (() => void) | null = null;
  private stopTicker: (() => void) | null = null;
  private shownDiceFor = "";
  private destroyed = false;
  private busy = false;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.stage3d = layout === "pad" ? null : h("div", { class: "board3d" }, this.banner, this.dice, this.effect, this.roundIntro);
    this.el = h(
      "section",
      { class: `bv bv--${layout}` },
      this.stage3d,
      h("aside", { class: "bv-side" }, layout === "pad" ? this.roundIntro : null, layout === "pad" ? this.banner : null, layout === "pad" ? this.effect : null, this.status, this.controls, this.bag, this.hud),
    );
    root.append(this.el);
    if (this.stage3d) {
      const host = this.stage3d;
      // La 3D est chargée à la demande (même fichier que l'aperçu des avatars).
      void import("../three/boardScene.ts").then(({ BoardScene }) => {
        if (this.destroyed) return;
        try {
          this.scene = new BoardScene(host);
          if (this.room?.game?.board) this.scene.update(this.room.game.board, this.room.players, { overview: this.layout === "tv" && !this.room.game.board.turn });
        } catch {
          host.append(h("p", { class: "board3d__error", text: "Ce navigateur ne sait pas afficher la 3D. Le jeu reste jouable avec le classement à côté." }));
        }
      });
    }
    this.stopTicker = everyFrame(() => this.tickDeadline());
    this.stopItems = onMyItems(() => this.room && this.update(this.room));
  }

  destroy(): void {
    this.destroyed = true;
    this.rollingStop?.();
    this.stopTicker?.();
    this.stopItems?.();
    this.scene?.destroy();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const state = room.game?.board;
    if (!state) return;
    this.scene?.update(state, room.players);
    this.renderBanner(state, room.players);
    this.renderRoundIntro(state);
    this.renderDice(state);
    this.renderEffect(state, room.players);
    this.renderControls(state, room.players);
    this.renderBag(state);
    this.renderOrder(state, room.players);
    this.renderStatus(state, room.players);
  }

  private name(players: PublicPlayer[], id: string): string {
    return players.find((p) => p.id === id)?.name ?? "?";
  }

  private renderBanner(state: BoardState, players: PublicPlayer[]): void {
    clear(this.banner);
    const turn = state.turn;
    if (!turn) return;
    const p = players.find((x) => x.id === turn.playerId);
    if (!p) return;
    const mine = turn.playerId === this.meId;
    this.banner.append(
      h("small", { text: state.config.maxRounds ? `Tour ${state.boardRound}/${state.config.maxRounds}` : `Tour ${state.boardRound}` }),
      playerAvatar(p, { size: 34 }),
      h("strong", { text: mine ? "À toi de jouer !" : `Au tour de ${p.name}` }),
    );
    this.banner.style.setProperty("--player", PLAYER_COLORS[p.color]?.hex ?? "#fff");
  }

  /** Grand bandeau « Tour X » au début de chaque tour de plateau. */
  private renderRoundIntro(state: BoardState): void {
    const show = !state.turn;
    if (show && this.roundIntro.hidden) {
      clear(this.roundIntro);
      const last = state.config.maxRounds && state.boardRound === state.config.maxRounds;
      this.roundIntro.append(
        h("strong", { text: state.config.maxRounds ? `Tour ${state.boardRound}/${state.config.maxRounds}` : `Tour ${state.boardRound}` }),
        h("small", { text: last ? `Dernier tour ! ${this.firstName(state)}` : this.firstName(state) }),
      );
      // Relance l'animation d'entrée.
      this.roundIntro.classList.remove("is-in");
      void this.roundIntro.offsetWidth;
      this.roundIntro.classList.add("is-in");
    }
    this.roundIntro.hidden = !show;
  }

  private firstName(state: BoardState): string {
    const p = this.room?.players.find((x) => x.id === state.order[0]);
    return p ? `${p.name} commence` : "";
  }

  /**
   * Dé façon roulette (manette, ou navigateur sans 3D) : les chiffres défilent, puis s'arrêtent sur le résultat.
   * Avec la 3D, les vrais dés sont lancés au-dessus du pion ; ici on n'affiche que le total s'il y a plusieurs dés.
   */
  private renderDice(state: BoardState): void {
    const turn = state.turn;
    const key = turn ? `${state.boardRound}:${turn.playerId}` : "";
    const with3d = this.scene !== null;
    if (turn?.phase === "rolling" && with3d) {
      this.dice.hidden = true;
      return;
    }
    if (turn?.phase === "rolling") {
      this.dice.hidden = false;
      this.dice.classList.remove("is-landed");
      if (!this.rollingStop) {
        let last = 0;
        this.rollingStop = everyFrame(() => {
          const now = performance.now();
          if (now - last < 70) return;
          last = now;
          this.dice.textContent = (turn.rolls.map((r) => r.value ?? 1 + Math.floor(Math.random() * r.sides))).join(" + ");
        });
      }
      return;
    }
    this.rollingStop?.();
    this.rollingStop = null;
    if (turn && turn.dice !== null && this.shownDiceFor !== key) {
      this.shownDiceFor = key;
      if (with3d && turn.rolls.length < 2) return;
      this.dice.hidden = false;
      this.dice.textContent = turn.rolls.length > 1 ? `${turn.rolls.map((r) => r.value).join(" + ")} = ${turn.dice}` : String(turn.dice);
      this.dice.classList.add("is-landed");
      setTimeout(() => {
        if (this.shownDiceFor === key) this.dice.hidden = true;
      }, 2600);
    } else if (!turn || turn.phase === "roll") {
      this.dice.hidden = true;
    }
  }

  private renderEffect(state: BoardState, players: PublicPlayer[]): void {
    const turn = state.turn;
    const effect = turn?.effect;
    const shopping = turn?.phase === "shop";
    const dueling = turn?.phase === "duel";
    this.effect.hidden = !effect && !shopping && !dueling;
    if (!turn || (!effect && !shopping && !dueling)) return;
    const name = this.name(players, turn.playerId);
    clear(this.effect);
    if (!effect && dueling) {
      this.effect.style.setProperty("--cell", CELL_INFO.duel.color);
      this.effect.append(h("span", { class: "bv-effect__symbol", text: "V" }), h("span", { text: `Duel ! ${name} choisit son adversaire…` }));
      return;
    }
    if (!effect) {
      this.effect.style.setProperty("--cell", CELL_INFO.boutique.color);
      this.effect.append(h("span", { class: "bv-effect__symbol", text: "$" }), h("span", { text: `${name} fait un tour à la boutique…` }));
      return;
    }
    const info = effect.type === "passe" || effect.type === "objet" ? null : CELL_INFO[effect.type];
    const color = effect.blocked !== undefined ? "#9AA5B8" : effect.type === "objet" ? "#F25FA8" : (info?.color ?? "#9257E8");
    this.effect.style.setProperty("--cell", color);
    const symbol = effect.blocked !== undefined ? "×" : effect.type === "objet" ? "★" : info?.symbol || "…";
    this.effect.append(
      h("span", { class: "bv-effect__symbol", text: symbol }),
      h("span", { text: effect.type === "passe" || effect.type === "objet" || (effect.type === "duel" && effect.blocked === undefined) ? `${name} ${effect.text}` : `${name} : ${effect.text}` }),
    );
  }

  /** Objets du joueur : utilisables avant de lancer le dé, pendant son tour. */
  private renderBag(state: BoardState): void {
    clear(this.bag);
    if (!this.meId || this.layout === "tv") return;
    const items = myItems();
    const turn = state.turn;
    const canUse = turn?.playerId === this.meId && turn.phase === "roll" && !turn.usedItem;
    if (!canUse) this.pickingPiped = false;
    this.bag.append(h("h3", { class: "bv-bag__title", text: `Tes objets (${items.length}/${state.config.maxItems})` }));
    if (!items.length) {
      this.bag.append(h("p", { class: "muted bv-bag__empty", text: "Aucun objet. Les boutiques ($) en vendent sur le chemin." }));
      return;
    }
    if (this.pickingPiped) {
      this.bag.append(
        h("p", { class: "bv-ask", text: "Dé pipé : quel résultat veux-tu ?" }),
        h(
          "div",
          { class: "bv-piped" },
          ...[1, 2, 3, 4, 5, 6].map((v) =>
            h("button", { class: "bv-piped__value", attrs: { type: "button" }, text: String(v), on: { click: () => void this.act({ type: "item", item: "de-pipe", value: v }) } }),
          ),
        ),
        h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Annuler", on: { click: () => ((this.pickingPiped = false), this.room && this.update(this.room)) } }),
      );
      return;
    }
    const list = h("ul", { class: "bv-bag__list" });
    items.forEach((id: ItemId) => {
      const info = ITEMS[id];
      list.append(
        h(
          "li",
          { class: "bv-item" },
          h("span", { class: "bv-item__icon", text: info.icon }),
          h("span", { class: "bv-item__text" }, h("strong", { text: info.name }), h("small", { text: info.help })),
          canUse
            ? h("button", {
                class: "btn btn--go bv-item__use",
                attrs: { type: "button" },
                text: "Utiliser",
                on: {
                  click: () => {
                    if (id === "de-pipe") {
                      this.pickingPiped = true;
                      if (this.room) this.update(this.room);
                    } else void this.act({ type: "item", item: id });
                  },
                },
              })
            : null,
        ),
      );
    });
    this.bag.append(list);
    if (turn?.playerId === this.meId && turn.phase === "roll" && turn.usedItem) this.bag.append(h("p", { class: "muted", text: "Un seul objet par tour." }));
  }

  private renderControls(state: BoardState, players: PublicPlayer[]): void {
    clear(this.controls);
    const turn = state.turn;
    if (!turn || !this.meId || this.layout === "tv") return;
    if (turn.playerId !== this.meId) {
      if (this.layout === "pad") {
        const what = turn.phase === "shop" ? "est à la boutique" : turn.phase === "duel" ? "choisit un adversaire pour un duel" : "joue";
        this.controls.append(h("p", { class: "bv-wait", text: `${this.name(players, turn.playerId)} ${what}. Regarde l'écran commun !` }));
      }
      return;
    }
    if (turn.phase === "roll") {
      const bonus = turn.rolls[1];
      this.controls.append(
        h("button", {
          class: "btn btn--go btn--big bv-roll",
          attrs: { type: "button" },
          text: bonus ? `Lancer les dés (+ ${BONUS_DIE_NAMES[bonus.sides] ?? "dé bonus"}, 1 à ${bonus.sides})` : turn.rolls[0]?.kind === "douze" ? "Lancer le dé à 12 faces" : "Lancer le dé",
          on: { click: () => void this.act({ type: "roll" }) },
        }),
        h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }),
      );
    } else if (turn.phase === "choose" && turn.choices) {
      this.controls.append(
        h("p", { class: "bv-ask", text: "Embranchement ! Quel chemin prends-tu ?" }),
        ...turn.choices.map((c) =>
          h(
            "button",
            {
              class: `bv-choice${c.detour ? " bv-choice--detour" : ""}`,
              attrs: { type: "button" },
              on: { click: () => void this.act({ type: "choose", cell: c.cell }) },
            },
            h("strong", { text: c.label }),
            h("small", { text: c.detour ? `${c.length} cases avant de rejoindre la route, plus de surprises` : `${c.length} cases avant la jonction` }),
          ),
        ),
        h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }),
      );
    } else if (turn.phase === "shop" && turn.shop) {
      const pawn = state.pawns[this.meId];
      const coins = pawn?.coins ?? 0;
      const full = myItems().length >= state.config.maxItems;
      this.controls.append(
        h("p", { class: "bv-ask", text: `Boutique ! Tu as ${coins} pièce${coins > 1 ? "s" : ""}${full ? " et ton sac est plein" : ""}.` }),
        h(
          "ul",
          { class: "bv-shop" },
          ...turn.shop.offers.map((o) =>
            h(
              "li",
              { class: "bv-item" },
              h("span", { class: "bv-item__icon", text: ITEMS[o.item].icon }),
              h("span", { class: "bv-item__text" }, h("strong", { text: ITEMS[o.item].name }), h("small", { text: ITEMS[o.item].help })),
              h(
                "button",
                {
                  class: "btn btn--go bv-item__use",
                  attrs: { type: "button", disabled: full || coins < o.price },
                  on: { click: () => void this.act({ type: "buy", item: o.item }) },
                },
                svg(COIN),
                h("span", { text: String(o.price) }),
              ),
            ),
          ),
        ),
        h("button", { class: "btn btn--big", attrs: { type: "button" }, text: "Repartir", on: { click: () => void this.act({ type: "leave" }) } }),
        h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }),
      );
    } else if (turn.phase === "duel" && turn.opponents) {
      this.controls.append(
        h("p", { class: "bv-ask", text: `Duel ! Qui défies-tu ? Le gagnant prend ${state.config.duelStake} pièces au perdant.` }),
        ...turn.opponents.flatMap((id) => {
          const p = players.find((x) => x.id === id);
          const pawn = state.pawns[id];
          if (!p || !pawn) return [];
          return h(
            "button",
            { class: "bv-choice bv-duel", attrs: { type: "button" }, on: { click: () => void this.act({ type: "duel", target: id }) } },
            playerAvatar(p, { size: 36 }),
            h("strong", { text: p.name }),
            h("small", {}, svg(COIN), state.scrambled > 0 ? obfuscated(2) : h("span", { text: ` ${pawn.coins} pièces` })),
          );
        }),
        h("p", { class: "muted bv-deadline", attrs: { "data-deadline": "1" } }),
      );
    } else if (turn.phase === "rolling") {
      this.controls.append(h("p", { class: "bv-wait", text: turn.rolls.length > 1 ? "Les dés tournent…" : "Le dé tourne…" }));
    }
  }

  private async act(action: BoardAction): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await request("game:action", action);
    } catch (err) {
      toast(err instanceof ServerError ? err.message : "Action impossible.", "error");
    } finally {
      this.busy = false;
    }
  }

  /** Classement : ordre de jeu, pièces, cases restantes. */
  private renderOrder(state: BoardState, players: PublicPlayer[]): void {
    clear(this.hud);
    if (state.scrambled > 0) {
      this.hud.append(h("li", { class: "bv-scrambled", text: `📡 Brouilleur actif : informations cachées (encore ${state.scrambled} tour${state.scrambled > 1 ? "s" : ""})` }));
    }
    const sorted = [...state.order].sort((a, b) => (state.remaining[a] ?? 0) - (state.remaining[b] ?? 0));
    for (const id of state.order) {
      const p = players.find((x) => x.id === id);
      const pawn = state.pawns[id];
      if (!p || !pawn) continue;
      const rank = sorted.indexOf(id) + 1;
      const hidden = state.scrambled > 0;
      this.hud.append(
        h(
          "li",
          { class: `bv-row${state.turn?.playerId === id ? " is-turn" : ""}${id === this.meId ? " is-me" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
          hidden ? obfuscated(2, "bv-row__rank") : h("span", { class: "bv-row__rank", text: rank === 1 ? "1er" : `${rank}e`, attrs: { title: "Place dans la course" } }),
          playerAvatar(p, { size: 36, sleepy: pawn.skipNext || !p.connected }),
          h(
            "span",
            { class: "bv-row__name" },
            p.name,
            state.teams ? h("span", { class: "team-dot", style: { background: TEAMS[state.teams[id]!]?.hex }, attrs: { title: TEAMS[state.teams[id]!]?.label } }) : null,
          ),
          h("span", { class: "bv-row__coins" }, svg(COIN), hidden ? obfuscated(2) : h("span", { text: String(pawn.coins) })),
          hidden ? h("small", { class: "bv-row__left" }, obfuscated(3), " cases") : h("small", { class: "bv-row__left", text: state.remaining[id] === 0 ? "arrivé" : `${state.remaining[id]} cases` }),
          pawn.itemCount && !hidden ? h("small", { class: "bv-row__items", text: "🎒".repeat(pawn.itemCount), attrs: { title: `${pawn.itemCount} objet(s)` } }) : null,
          pawn.skipNext ? h("small", { class: "bv-row__skip", text: "passe son tour" }) : null,
          pawn.bonusDie
            ? h("small", {
                class: `bv-row__bonus bv-row__bonus--${pawn.bonusDie}`,
                text: `+ ${BONUS_DIE_NAMES[pawn.bonusDie] ?? `dé ${pawn.bonusDie}`}`,
                attrs: { title: `Dé bonus (1 à ${pawn.bonusDie}) au prochain lancer` },
              })
            : null,
        ),
      );
    }
  }

  private renderStatus(state: BoardState, players: PublicPlayer[]): void {
    clear(this.status);
    if (!this.meId || this.layout === "tv") return;
    const pawn = state.pawns[this.meId];
    if (!pawn) return;
    const cell = state.board.cells[pawn.cell];
    const info = cell ? CELL_INFO[cell.type] : null;
    const me = players.find((p) => p.id === this.meId);
    append(this.status, [
      me ? playerAvatar(me, { size: 48 }) : null,
      h(
        "div",
        {},
        h("strong", { text: state.remaining[this.meId] === 0 ? "Arrivé !" : state.scrambled > 0 ? "Cases restantes brouillées" : `Encore ${state.remaining[this.meId]} cases` }),
        h("small", { class: "muted", text: info ? `Case : ${info.label.toLowerCase()}` : "" }),
      ),
      h("span", { class: "bv-row__coins bv-status__coins" }, svg(COIN), h("span", { text: String(pawn.coins) })),
    ]);
  }

  /** Compte à rebours avant le lancer ou le choix automatique. */
  private tickDeadline(): void {
    const turn = this.room?.game?.board?.turn;
    const el = this.controls.querySelector<HTMLElement>("[data-deadline]");
    if (!el || !turn?.endsAt) return;
    const left = Math.max(0, Math.ceil((turn.endsAt - serverNow()) / 1000));
    el.textContent =
      turn.phase === "roll" ? `Lancer automatique dans ${left} s` : turn.phase === "shop" ? `Départ automatique dans ${left} s` : `Choix automatique dans ${left} s`;
  }
}
