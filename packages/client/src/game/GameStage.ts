import { MINI_GAME_VIEWS, type MiniGameView, type ViewLayout } from "@rzparty/minigames/client";
import { GAME_MODES, PLAYER_COLORS, TEAMS, normalizeAvatar, type GameSnapshot, type PublicPlayer, type RoomSnapshot } from "@rzparty/shared";
import { request, socket, ServerError } from "../net/connection.ts";
import { append, clear, everyFrame, h, svg } from "../ui/dom.ts";
import { avatarSvg, playerAvatar } from "../ui/avatar.ts";
import { toast } from "../ui/toast.ts";
import { serverNow } from "./clock.ts";
import { BONUS_DIE_NAMES, BoardView, COIN } from "./BoardView.ts";
import { WheelView } from "./WheelView.ts";
import { LotoView } from "./LotoView.ts";
import { QuizView } from "./QuizView.ts";
import { MotsView } from "./MotsView.ts";
import { GlobeView } from "./GlobeView.ts";
import { TriosView } from "./TriosView.ts";
import { BateauView } from "./BateauView.ts";
import { PairesView } from "./PairesView.ts";
import { AmitieView } from "./AmitieView.ts";

/** Écrans des modes de jeu hors mini-jeux (une classe par étape). */
interface ModeView {
  update(room: RoomSnapshot): void;
  destroy(): void;
}
const MODE_VIEWS: Record<string, new (root: HTMLElement, layout: ViewLayout, meId: string | null) => ModeView> = {
  wheel: WheelView,
  loto: LotoView,
  quiz: QuizView,
  mots: MotsView,
  globe: GlobeView,
  trios: TriosView,
  bateau: BateauView,
  paires: PairesView,
  amitie: AmitieView,
};
import { obfuscated } from "../ui/obfuscate.ts";

const HEART = `<svg viewBox="0 0 20 18" width="18" height="16" aria-hidden="true"><path d="M10 17 2.3 9.6A4.8 4.8 0 0 1 10 3.4a4.8 4.8 0 0 1 7.7 6.2z" fill="#F0483E" stroke="#B52A22" stroke-width="1.4"/></svg>`;
const HEART_EMPTY = `<svg viewBox="0 0 20 18" width="18" height="16" aria-hidden="true"><path d="M10 17 2.3 9.6A4.8 4.8 0 0 1 10 3.4a4.8 4.8 0 0 1 7.7 6.2z" fill="none" stroke="#9FB2C6" stroke-width="1.6"/></svg>`;
const CROWN = `<svg class="crown" viewBox="0 0 24 18" width="40" height="30" aria-hidden="true"><path d="M2 15 1 4l6 5 5-8 5 8 6-5-1 11z" fill="#FFC83D" stroke="#B9850B" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const CATEGORY_LABELS: Record<string, string> = {
  reflexes: "Réflexes",
  memoire: "Mémoire",
  frappe: "Vitesse de frappe",
  calcul: "Calcul mental",
  logique: "Logique",
  labyrinthe: "Orientation",
  chaines: "Jeu de lettres",
  bombe: "Tous ensemble",
};

/**
 * Affichage d'une partie en cours, quel que soit l'écran :
 * `tv` pour l'écran commun, `pad` pour la manette, `solo` pour l'écran individuel.
 * Gère les étapes (règles, compte à rebours, mini-jeu, résultats, podium).
 */
export class GameStage {
  private room: RoomSnapshot | null = null;
  private stageKey = "";
  private view: MiniGameView | null = null;
  private viewRound = -1;
  private latest = new Map<number, { state?: unknown; private?: unknown }>();
  private stopTicker: (() => void) | null = null;
  private boardView: BoardView | null = null;
  private modeView: { stage: string; view: ModeView } | null = null;

  private readonly el: HTMLElement;
  private readonly top: HTMLElement;
  private readonly main: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly layout: ViewLayout,
    private readonly meId: string | null,
  ) {
    this.top = h("header", { class: "gs__top" });
    this.main = h("main", { class: "gs__main" });
    this.el = h("div", { class: `gs gs--${layout}` }, this.top, this.main);
    root.append(this.el);
    socket.on("mg:state", this.onMgState);
    socket.on("mg:private", this.onMgPrivate);
  }

  destroy(): void {
    socket.off("mg:state", this.onMgState);
    socket.off("mg:private", this.onMgPrivate);
    this.unmountView();
    this.boardView?.destroy();
    this.modeView?.view.destroy();
    this.stopTicker?.();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const game = room.game;
    if (!game) return;
    this.renderTop(room, game);

    // On ne reconstruit la zone principale que si l'étape change (sinon on met à jour sur place).
    const key = `${game.round}:${game.stage}`;
    if (key !== this.stageKey) {
      this.stageKey = key;
      this.renderStage(room, game);
    } else if (game.stage === "intro") {
      this.renderStage(room, game);
    } else if (game.stage === "board") {
      this.boardView?.update(room);
    } else if (this.modeView?.stage === game.stage) {
      this.modeView.view.update(room);
    }
  }

  // ───────────── Bandeau des joueurs ─────────────

  private renderTop(room: RoomSnapshot, game: GameSnapshot): void {
    clear(this.top);
    const { rule, lives } = room.settings.survival;
    const chips = game.standings
      .map((s) => ({ s, p: room.players.find((p) => p.id === s.playerId) }))
      .filter((x): x is { s: typeof x.s; p: PublicPlayer } => Boolean(x.p));
    const me = this.meId ? room.players.find((p) => p.id === this.meId) : undefined;

    append(this.top, [
      h(
        "ul",
        { class: "gs__standings", attrs: { "aria-label": "Situation des joueurs" } },
        ...chips.map(({ s, p }) =>
          h(
            "li",
            { class: `chip${s.eliminated ? " chip--out" : ""}${p.id === this.meId ? " chip--me" : ""}${p.connected ? "" : " chip--away"}` },
            playerAvatar(p, { sleepy: s.eliminated || !p.connected, size: 30 }),
            h("span", { class: "chip__name", text: p.name }),
            game.board?.teams ? h("span", { class: "team-dot", style: { background: TEAMS[game.board.teams[p.id]!]?.hex }, attrs: { title: TEAMS[game.board.teams[p.id]!]?.label } }) : null,
            game.mode === "roue"
              ? h("strong", { class: "chip__score", text: `🏅 ${s.score}` })
              : game.mode === "loto"
              ? h("strong", { class: "chip__score", text: `${s.score}/16` })
              : game.mode === "trios" || game.mode === "paires"
              ? h("strong", { class: "chip__score", text: game.mode === "paires" ? `${s.score} paire${s.score > 1 ? "s" : ""}` : `${s.score} pt${s.score > 1 ? "s" : ""}` })
              : game.mode === "bateau"
              ? h("strong", { class: "chip__score", text: `⛵ ${s.score}` })
              : game.mode === "amitie"
              ? h("strong", { class: "chip__score", text: `💞 ${s.score} %` })
              : game.mode === "quiz"
              ? h("strong", { class: "chip__score", text: `${s.score} pt${s.score > 1 ? "s" : ""}` })
              : game.mode === "mots"
              ? h("strong", { class: "chip__score", text: `💥 ${s.score}` })
              : game.mode === "voyage"
              ? h("strong", { class: "chip__score", text: `📷 ${s.score} · 🪙 ${game.globe?.coins[p.id] ?? 0}` })
              : game.mode === "plateau"
              ? h(
                  "span",
                  { class: "chip__coins" },
                  svg(COIN),
                  game.board?.scrambled ? obfuscated(2) : h("strong", { text: String(s.score) }),
                  game.board
                    ? game.board.scrambled
                      ? h("small", {}, "· ", obfuscated(2), " cases")
                      : h("small", { text: game.board.remaining[p.id] === 0 ? "arrivé" : `· ${game.board.remaining[p.id]} cases` })
                    : null,
                )
              : rule === "vies"
              ? h(
                  "span",
                  { class: "chip__lives", attrs: { "aria-label": `${s.lives} vie${s.lives > 1 ? "s" : ""}` } },
                  ...Array.from({ length: lives }, (_, i) => svg(i < s.lives ? HEART : HEART_EMPTY)),
                )
              : h("strong", { class: "chip__score", text: `${s.score} pt${s.score > 1 ? "s" : ""}` }),
          ),
        ),
      ),
      this.layout !== "tv" && me?.isChef && game.stage !== "podium"
        ? h("button", { class: "btn btn--ghost btn--small gs__stop", attrs: { type: "button" }, text: "Arrêter la partie", on: { click: () => this.confirmStop() } })
        : null,
    ]);
  }

  // ───────────── Étapes ─────────────

  private renderStage(room: RoomSnapshot, game: GameSnapshot): void {
    if (game.stage !== "play") this.unmountView();
    if (game.stage !== "board") {
      this.boardView?.destroy();
      this.boardView = null;
    }
    if (this.modeView && this.modeView.stage !== game.stage) {
      this.modeView.view.destroy();
      this.modeView = null;
    }
    this.stopTicker?.();
    this.stopTicker = null;
    if (game.stage !== "play") clear(this.main);

    switch (game.stage) {
      case "intro":
        return this.renderIntro(room, game);
      case "countdown":
        return this.renderCountdown(game);
      case "play":
        return this.renderPlay(room, game);
      case "results":
        return this.renderResults(room, game);
      case "board":
        if (!this.boardView) this.boardView = new BoardView(this.main, this.layout, this.meId);
        this.boardView.update(room);
        return;
      case "wheel":
      case "loto":
      case "quiz":
      case "mots":
      case "globe":
      case "trios":
      case "bateau":
      case "paires":
      case "amitie": {
        if (!this.modeView) this.modeView = { stage: game.stage, view: new MODE_VIEWS[game.stage]!(this.main, this.layout, this.meId) };
        this.modeView.view.update(room);
        return;
      }
      case "podium":
        return this.renderPodium(room, game);
    }
  }

  private renderIntro(room: RoomSnapshot, game: GameSnapshot): void {
    const mg = game.miniGame;
    if (!mg) return;
    const amIn = this.meId !== null && game.participants.includes(this.meId);
    const iAmReady = this.meId !== null && game.ready.includes(this.meId);
    const seconds = h("span", { class: "intro__seconds" });

    this.main.append(
      h(
        "section",
        { class: "intro" },
        h("p", {
          class: "intro__round",
          text:
            game.purpose === "ordre" && game.mode !== "trios"
              ? `Qui commence ? Ce mini-jeu décide de l'ordre de jeu · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
              : game.purpose === "loto"
                ? `Boule Mini-jeu ! Le gagnant coche la case de son choix · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "bateau"
                ? `Le 1er reçoit un petit personnage à embarquer, le dernier un gros ! · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "paires"
                ? `Mini-jeu bonus : le gagnant gagne un cœur pour son prochain tour · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "amitie"
                ? `Test de synchro : ceux qui finissent côte à côte se rapprochent · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.mode === "trios" && game.purpose === "ordre"
                ? `Ce mini-jeu décide de l'ordre pour choisir au centre · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "cagnotte"
                ? game.wheel?.battle?.kind === "bataille13"
                  ? `${room.players.find((p) => p.id === game.wheel?.battle?.solo)?.name ?? "?"} seul contre tous ! La banque de ${game.wheel?.pot ?? 0} médailles est en jeu · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                  : `Bataille ! Le gagnant rafle la banque de ${game.wheel?.pot ?? 0} médailles · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "voyage"
                ? `Pièces du tour (10, 5, 3, 1) et ordre de passage en jeu ! · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "unvstous"
                ? `${room.players.find((p) => p.id === game.globe?.turn?.playerId)?.name ?? "?"} seul contre tous ! Victoire : 15 pièces, défaite : 5 pièces pour chaque adversaire · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "duelroue"
                ? `Duel ! ${game.participants.map((id) => room.players.find((p) => p.id === id)?.name ?? "?").join(" contre ")} : si ${room.players.find((p) => p.id === game.wheel?.battle?.solo)?.name ?? "le lanceur"} gagne, il prend la moitié des médailles de l'autre · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "duel"
                ? `Duel ! ${game.participants.map((id) => room.players.find((p) => p.id === id)?.name ?? "?").join(" contre ")} · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : game.purpose === "pieces"
                ? `Fin du tour ${game.board?.boardRound ?? ""} · ${CATEGORY_LABELS[mg.category] ?? mg.category}`
                : `Manche ${game.round} · ${CATEGORY_LABELS[mg.category] ?? mg.category}`,
        }),
        game.purpose === "pieces" ? h("p", { class: "intro__goal", text: "Jouer pour gagner des pièces et choisir l'ordre de passage" }) : null,
        h("h1", { class: "intro__name", text: mg.name }),
        h("p", { class: "intro__rules", text: mg.rules }),
        h(
          "ul",
          { class: "intro__ready", attrs: { "aria-label": "Joueurs prêts" } },
          ...game.participants.map((id) => {
            const p = room.players.find((x) => x.id === id);
            if (!p) return null;
            const ok = game.ready.includes(id);
            return h("li", { class: ok ? "is-ready" : "" }, playerAvatar(p, { size: 40 }), h("span", { text: ok ? "prêt" : "…" }));
          }),
        ),
        amIn && !iAmReady
          ? h("button", { class: "btn btn--go btn--big intro__go", attrs: { type: "button" }, text: "Je suis prêt", on: { click: () => void this.ready() } })
          : amIn
            ? h("p", { class: "intro__wait", text: "Prêt ! On attend les autres…" })
            : this.layout !== "tv" && this.meId
              ? h("p", { class: "intro__wait", text: "Tu es éliminé : tu regardes cette manche." })
              : null,
        h("p", { class: "intro__timer" }, "Début dans ", seconds),
      ),
    );
    this.stopTicker = everyFrame(() => {
      const left = game.stageEndsAt ? Math.max(0, Math.ceil((game.stageEndsAt - serverNow()) / 1000)) : 0;
      seconds.textContent = `${left} s`;
    });
  }

  private renderCountdown(game: GameSnapshot): void {
    const number = h("span", { class: "countdown__n" });
    this.main.append(h("section", { class: "countdown", attrs: { "aria-live": "assertive" } }, h("p", { text: game.miniGame?.name ?? "" }), number));
    let shown = "";
    this.stopTicker = everyFrame(() => {
      const left = game.stageEndsAt ? Math.ceil((game.stageEndsAt - serverNow()) / 1000) : 0;
      const text = left > 0 ? String(Math.min(3, left)) : "Go !";
      if (text === shown) return;
      shown = text;
      number.textContent = text;
      number.classList.remove("pop");
      void number.offsetWidth;
      number.classList.add("pop");
    });
  }

  private renderPlay(room: RoomSnapshot, game: GameSnapshot): void {
    if (this.view && this.viewRound === game.round) return;
    this.unmountView();
    clear(this.main);
    const id = game.miniGame?.id;
    const factory = id ? MINI_GAME_VIEWS[id] : undefined;
    if (!factory) {
      this.main.append(h("p", { class: "panel", text: "Ce mini-jeu n'a pas encore d'affichage." }));
      return;
    }
    const amIn = this.meId !== null && game.participants.includes(this.meId);
    const host = h("div", { class: "gs__mg" });
    if (this.layout !== "pad" && game.miniGame) this.main.append(h("h1", { class: "gs__mgname", text: game.miniGame.name }));
    this.main.append(host);
    if (!amIn && this.layout === "pad") {
      host.append(h("p", { class: "spectate", text: "Tu es éliminé. Suis la manche sur l'écran commun !" }));
    }
    const round = game.round;
    this.view = factory(host, {
      // Un joueur éliminé regarde la manche comme sur l'écran commun.
      layout: amIn ? this.layout : this.layout === "pad" ? "pad" : "tv",
      me: amIn ? this.meId : null,
      players: game.participants.flatMap((pid) => {
        const p = room.players.find((x) => x.id === pid);
        return p ? [{ id: p.id, name: p.name, color: p.color, isBot: p.isBot }] : [];
      }),
      send: (input) => socket.emit("game:input", { round, input }),
      serverNow,
      avatar: (playerId, size) => {
        const p = room.players.find((x) => x.id === playerId);
        return p ? playerAvatar(p, { size }) : avatarSvg(undefined, { size });
      },
      drawAvatar: (avatar, size) => avatarSvg(normalizeAvatar(avatar), { size }),
    });
    this.viewRound = round;
    const cached = this.latest.get(round);
    if (cached?.state !== undefined) this.view.update(cached.state);
    if (cached?.private !== undefined) this.view.updatePrivate?.(cached.private);
  }

  private renderResults(room: RoomSnapshot, game: GameSnapshot): void {
    const result = game.lastResult;
    if (!result) return;
    const rule = room.settings.survival.rule;
    const myPlace = this.meId ? result.ranking.findIndex((g) => g.includes(this.meId!)) : -1;

    const rows: HTMLElement[] = [];
    let place = 1;
    for (const group of result.ranking) {
      for (const id of group) {
        const p = room.players.find((x) => x.id === id);
        if (!p) continue;
        const change = result.changes.find((c) => c.playerId === id);
        const delta =
          game.purpose === "ordre"
            ? (() => {
                const pos = (game.board?.order.indexOf(id) ?? -1) + 1 || place;
                return `joue en ${pos === 1 ? "1er" : `${pos}e`}`;
              })()
            : game.purpose === "loto"
              ? change?.points
                ? "coche une case !"
                : ""
              : game.purpose === "bateau"
              ? change?.points
                ? `embarque un ${["", "petit", "moyen", "gros"][change.points]} personnage`
                : ""
              : game.purpose === "paires"
              ? change?.points
                ? "+1 cœur"
                : ""
              : game.purpose === "amitie"
              ? ""
              : game.purpose === "voyage" || game.purpose === "unvstous"
              ? change?.points
                ? `+${change.points} pièce${change.points > 1 ? "s" : ""}`
                : ""
              : game.purpose === "cagnotte" || game.purpose === "duelroue"
              ? change?.points
                ? `${change.points > 0 ? "+" : "−"}${Math.abs(change.points)} médaille${Math.abs(change.points) > 1 ? "s" : ""}`
                : ""
              : game.purpose === "duel"
              ? change?.points
                ? `${change.points > 0 ? "+" : "−"}${Math.abs(change.points)} pièce${Math.abs(change.points) > 1 ? "s" : ""}`
                : "égalité"
              : game.purpose === "pieces"
              ? [
                  `+${change?.points ?? 0} pièce${(change?.points ?? 0) > 1 ? "s" : ""}${game.board?.teams ? " (équipe)" : ""}`,
                  `joue en ${(() => {
                    const pos = (game.board?.order.indexOf(id) ?? -1) + 1 || place;
                    return pos === 1 ? "1er" : `${pos}e`;
                  })()}`,
                  change?.bonusDie ? `${BONUS_DIE_NAMES[change.bonusDie] ?? "dé bonus"} (${change.bonusDie} faces)` : "",
                ].filter(Boolean).join(" · ")
              : change?.eliminated ? "Éliminé !" : change?.lives ? "−1 vie" : change?.points ? `+${change.points} pt${change.points > 1 ? "s" : ""}` : rule === "vies" ? "sauvé" : "";
        rows.push(
          h(
            "li",
            { class: `result${id === this.meId ? " is-me" : ""}${change?.lives || (change?.points ?? 0) < 0 ? " is-loss" : ""}${(change?.points ?? 0) > 0 ? " is-gain" : ""}` },
            h("span", { class: "result__place", text: place === 1 ? "1er" : `${place}e` }),
            playerAvatar(p, { size: 40 }),
            h("span", { class: "result__name", text: p.name }),
            h("strong", { class: "result__delta", text: delta }),
          ),
        );
      }
      place += group.length;
    }

    this.main.append(
      h(
        "section",
        { class: "results" },
        h("h1", { text: game.miniGame?.name ? `Résultats : ${game.miniGame.name}` : "Résultats" }),
        this.layout !== "tv" && myPlace >= 0
          ? h("p", { class: "results__me", text: myPlace === 0 ? "Tu gagnes la manche !" : `Tu termines ${placeLabel(result.ranking, this.meId!)}.` })
          : null,
        result.teams
          ? h(
              "ol",
              { class: "results__teams", attrs: { "aria-label": "Classement des équipes" } },
              ...result.teams.flatMap((group, i) =>
                group.map((t) =>
                  h("li", { style: { "--team": TEAMS[t]?.hex } }, h("strong", { text: i === 0 ? "1re" : `${i + 1}e` }), h("span", { text: TEAMS[t]?.label ?? "Équipe" })),
                ),
              ),
            )
          : null,
        h("ol", { class: "results__list" }, ...rows),
        h("p", { class: "muted results__next", text: game.mode === "plateau" ? "Retour au plateau dans un instant…" : game.mode === "roue" ? "Retour à la roue dans un instant…" : game.mode === "loto" ? "Retour au bingo dans un instant…" : game.mode === "bateau" ? "Retour au bateau dans un instant…" : game.mode === "trios" ? "Au centre, chacun son tour…" : game.mode === "paires" ? "Retour aux paires dans un instant…" : game.mode === "amitie" ? "Question suivante dans un instant…" : "Prochaine manche dans un instant…" }),
      ),
    );
  }

  private renderPodium(room: RoomSnapshot, game: GameSnapshot): void {
    const winners = game.winners.flatMap((id) => room.players.filter((p) => p.id === id));
    const me = this.meId ? room.players.find((p) => p.id === this.meId) : undefined;
    const iWon = this.meId !== null && game.winners.includes(this.meId);
    const rule = room.settings.survival.rule;
    const others = [...game.standings]
      .filter((s) => !game.winners.includes(s.playerId))
      .sort((a, b) =>
        game.mode === "plateau" && game.board
          ? (game.board.remaining[a.playerId] ?? 0) - (game.board.remaining[b.playerId] ?? 0)
          : rule === "vies" && game.mode === "survie" ? b.lives - a.lives : game.mode === "mots" ? a.score - b.score : b.score - a.score,
      );

    this.main.append(
      h(
        "section",
        { class: "podium" },
        h("p", { class: "podium__mode", text: `${GAME_MODES[game.mode].label} terminée` }),
        h("h1", { class: "podium__title", text: (() => {
            const teams = game.board?.teams;
            const team = teams && winners[0] ? teams[winners[0].id] : undefined;
            if (team !== undefined) return `L'${TEAMS[team]?.label ?? "équipe"} gagne !`;
            if (game.mode === "bateau") return game.bateau?.phase === "won" ? "Tout l'équipage est à bord !" : "Le bateau a chaviré…";
            if (game.mode === "amitie" && winners.length === 2) return `${winners[0]!.name} et ${winners[1]!.name} : ${game.standings.find((s) => s.playerId === winners[0]!.id)?.score ?? 0} % d'affinité !`;
            return winners.length > 1 ? "Égalité au sommet !" : winners.length ? `${winners[0]!.name} gagne !` : "Partie terminée";
          })(),
        }),
        h(
          "div",
          { class: "podium__stage" },
          ...winners.map((p) =>
            h(
              "div",
              { class: "podium__winner", style: { "--player": PLAYER_COLORS[p.color]?.hex } },
              svg(CROWN),
              playerAvatar(p, { size: this.layout === "pad" ? 96 : 140 }),
              h("div", { class: "podium__block" }, h("span", { text: p.name })),
            ),
          ),
        ),
        this.layout !== "tv" && this.meId ? h("p", { class: "podium__me", text: iWon ? "Bravo, tu as gagné !" : "Bien joué, ce sera pour la prochaine !" }) : null,
        others.length
          ? h(
              "ol",
              { class: "podium__others" },
              ...others.flatMap((s) => {
                const p = room.players.find((x) => x.id === s.playerId);
                return p ? [h("li", {}, playerAvatar(p, { sleepy: true, size: 30 }), h("span", { text: p.name }))] : [];
              }),
            )
          : null,
        me?.isChef
          ? h("button", { class: "btn btn--go btn--big podium__back", attrs: { type: "button" }, text: "Retour au salon", on: { click: () => void this.backToLobby() } })
          : h("p", { class: "muted", text: "Le chef va ramener tout le monde au salon." }),
      ),
    );
  }

  // ───────────── Actions ─────────────

  private async ready(): Promise<void> {
    try {
      await request("game:ready");
    } catch (err) {
      toast(err instanceof ServerError ? err.message : "Action impossible.", "error");
    }
  }

  private async backToLobby(): Promise<void> {
    try {
      await request("chef:backToLobby");
    } catch (err) {
      toast(err instanceof ServerError ? err.message : "Action impossible.", "error");
    }
  }

  private confirmStop(): void {
    const dialog = h(
      "div",
      { class: "sheet", attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Arrêter la partie" } },
      h(
        "div",
        { class: "panel sheet__card" },
        h("p", { text: "Arrêter la partie et revenir au salon ?" }),
        h(
          "div",
          { class: "sheet__actions" },
          h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Continuer", on: { click: () => dialog.remove() } }),
          h("button", { class: "btn btn--danger", attrs: { type: "button" }, text: "Arrêter", on: { click: () => (dialog.remove(), void this.backToLobby()) } }),
        ),
      ),
    );
    document.body.append(dialog);
  }

  // ───────────── Mini-jeu ─────────────

  private onMgState = ({ round, state }: { round: number; state: unknown }) => {
    this.cache(round).state = state;
    if (this.view && this.viewRound === round) this.view.update(state);
  };

  private onMgPrivate = ({ round, data }: { round: number; data: unknown }) => {
    this.cache(round).private = data;
    if (this.view && this.viewRound === round) this.view.updatePrivate?.(data);
  };

  private cache(round: number) {
    let entry = this.latest.get(round);
    if (!entry) {
      entry = {};
      this.latest.set(round, entry);
      for (const r of this.latest.keys()) if (r < round - 1) this.latest.delete(r);
    }
    return entry;
  }

  private unmountView(): void {
    this.view?.destroy();
    this.view = null;
    this.viewRound = -1;
  }
}

function placeLabel(ranking: string[][], id: string): string {
  let place = 1;
  for (const group of ranking) {
    if (group.includes(id)) return group.length > 1 ? `${place}e ex æquo` : `${place}e`;
    place += group.length;
  }
  return "";
}
