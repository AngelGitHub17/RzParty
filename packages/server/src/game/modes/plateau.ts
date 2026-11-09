import {
  ERRORS,
  ITEMS,
  ITEM_IDS,
  SCRAMBLE_ROUNDS,
  TEAMS,
  configFor,
  type BoardConfig,
  isItemId,
  type ItemId,
  distancesToFinish,
  forkChoices,
  generateBoard,
  type Board,
  type BoardTurn,
  type GameSnapshot,
  type PawnState,
  type RoundResult,
  type Standing,
} from "@rzparty/shared";
import { botSkill } from "@rzparty/minigames/server";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

/** Rythme du plateau, en millisecondes. */
export const BOARD_TIMINGS = {
  /** Temps d'une case pendant un déplacement (animation des pions). */
  step: 330,
  /** Le dé tourne avant de s'arrêter. */
  rolling: 1600,
  /** Affichage de l'effet d'une case. */
  effect: 2200,
  /** Pause avant le tour suivant. */
  between: 600,
  /** Un humain qui ne lance pas son dé : lancer automatique. */
  rollTimeout: 30_000,
  /** Un humain qui ne choisit pas son chemin : choix automatique. */
  chooseTimeout: 20_000,
  /** Un bot ou un absent réfléchit. */
  botThink: 1300,
  /** Annonce « Tour X » au début de chaque tour de plateau. */
  roundIntro: 2200,
  /** Le dé retombé reste affiché avant que le pion avance. */
  diceShow: 900,
  /** Un humain qui ne quitte pas la boutique : sortie automatique. */
  shopTimeout: 25_000,
  /** Après l'utilisation d'un objet par un bot, avant son lancer. */
  itemShow: 1800,
};

/**
 * Aimant à pièces. 3 chances sur 4 : le lanceur vole 3 à 10 pièces à chaque adversaire.
 * 1 sur 4 (retour de flamme) : il perd 1 à 5 pièces, distribuées une à une aux autres.
 * Renvoie les variations de pièces par joueur.
 */
export function magnet(coins: Record<string, number>, user: string, random: () => number): { backfire: boolean; delta: Record<string, number> } {
  const delta: Record<string, number> = Object.fromEntries(Object.keys(coins).map((id) => [id, 0]));
  const others = Object.keys(coins).filter((id) => id !== user);
  const amount = () => 1 + Math.floor(random() * 5);
  if (random() < 0.75) {
    for (const id of others) {
      const taken = Math.min(coins[id]!, 3 + Math.floor(random() * 8));
      delta[id]! -= taken;
      delta[user]! += taken;
    }
    return { backfire: false, delta };
  }
  const lost = Math.min(coins[user]!, amount());
  delta[user]! -= lost;
  const start = Math.floor(random() * Math.max(1, others.length));
  for (let i = 0; i < lost && others.length; i++) delta[others[(start + i) % others.length]!]! += 1;
  return { backfire: true, delta };
}

/**
 * Dé bonus gagné selon la place au mini-jeu :
 * dé d'or (1 à 6) pour le 1er, d'argent (1 à 3) pour le 2e, de bronze (1 ou 2) pour le 3e, rien pour le dernier.
 */
export function bonusDieForPlace(place: number, groups: number): number | null {
  if (place >= groups - 1) return null;
  return [6, 3, 2][place] ?? null;
}

/** Défi final raté : on redescend de ce nombre de cases. */
export const FINAL_FALL = 6;

/** Pour tester la boutique : RZ_START_COINS=30 donne des pièces à tout le monde au départ. */
const START_COINS = Math.max(0, Number(process.env.RZ_START_COINS) || 0);


/**
 * Pièces gagnées selon la place au mini-jeu : 20 pour le 1er, 10 pour le 2e, 5 pour le 3e,
 * 1 pour le dernier (à partir de 4 places), 3 pour les places intermédiaires.
 */
export function coinsForPlace(place: number, groups: number): number {
  if (place === 0) return 20;
  if (place === 1) return 10;
  if (place === 2) return 5;
  return place === groups - 1 ? 1 : 3;
}

interface Pawn extends Omit<PawnState, "itemCount"> {
  /** Cases parcourues depuis le départ (pour reculer sur une case malus). */
  trail: number[];
  /** Objets portés (secrets). */
  items: ItemId[];
}

/**
 * Mode Plateau : la course vers l'arrivée.
 * Un mini-jeu décide de l'ordre de jeu ; ensuite chacun lance le dé à son tour,
 * puis un mini-jeu à chaque fin de tour rapporte des pièces. Le premier arrivé gagne.
 */
export class BoardGame extends BaseGame {
  protected readonly mode = "plateau" as const;
  private board: Board;
  private config: BoardConfig;
  private distances: number[];
  private pawns = new Map<string, Pawn>();
  private order: string[] = [];
  private turnIndex = 0;
  private boardRound = 0;
  private turn: BoardTurn | null = null;
  private moveId = 0;
  private pendingSteps = 0;
  /** Dé pipé : valeur choisie pour le prochain lancer. */
  private piped: number | null = null;
  /** Boutiques déjà visitées pendant ce tour (pour ne pas y revenir). */
  private shopsVisited = new Set<number>();
  /** Les deux joueurs du duel en cours. */
  private duelists: string[] = [];
  /** Suite du déplacement après la boutique. */
  private afterShop: (() => void) | null = null;
  /** Le Brouilleur cache les informations jusqu'à ce tour de plateau inclus. */
  private scrambledUntil = 0;
  /** Équipe de chaque joueur (null = chacun pour soi). */
  private teamOf: Map<string, number> | null = null;

  constructor(host: GameHost) {
    super(host);
    this.config = structuredClone(configFor(host.room.settings.board));
    this.board = generateBoard(Math.floor(host.random() * 2 ** 31), host.room.settings.board.size, this.config);
    this.distances = distancesToFinish(this.board);
    const startCoins = Math.max(START_COINS, this.config.startCoins);
    const teams = Math.min(host.room.settings.teams, host.room.players.length);
    if (teams >= 2) {
      // Équipes tirées au hasard, de tailles aussi égales que possible.
      const shuffled = [...host.room.players].sort(() => host.random() - 0.5);
      this.teamOf = new Map(shuffled.map((p, i) => [p.id, i % teams]));
    }
    // Les coéquipiers partagent un même porte-monnaie : `pawn.coins` lit et écrit celui de l'équipe.
    const wallets = new Map<number, { coins: number }>();
    for (const p of host.room.players) {
      const team = this.teamOf?.get(p.id);
      let wallet = team === undefined ? { coins: startCoins } : wallets.get(team);
      if (!wallet) wallets.set(team!, (wallet = { coins: startCoins }));
      const w = wallet;
      const pawn = { cell: this.board.start, skipNext: false, bonusDie: null, trail: [this.board.start], items: [] } as unknown as Pawn;
      Object.defineProperty(pawn, "coins", { get: () => w.coins, set: (v: number) => (w.coins = v), enumerable: true });
      this.pawns.set(p.id, pawn);
    }
  }

  /** Coéquipiers d'un joueur (lui compris) ; lui seul hors équipes. */
  private teamMates(id: string): string[] {
    const team = this.teamOf?.get(id);
    if (team === undefined) return [id];
    return this.players().filter((p) => this.teamOf!.get(p) === team);
  }

  /** Un joueur par porte-monnaie (pour les effets sur les pièces) ; `prefer` représente son équipe. */
  private holders(prefer?: string): string[] {
    if (!this.teamOf) return this.players();
    const byTeam = new Map<number, string>();
    for (const id of this.players()) {
      const t = this.teamOf.get(id)!;
      if (!byTeam.has(t) || id === prefer) byTeam.set(t, id);
    }
    return [...byTeam.values()];
  }

  /**
   * Classement par équipe : la place moyenne des membres de chaque équipe dans le mini-jeu.
   * Renvoie des groupes de numéros d'équipe (égalité = même groupe).
   */
  private teamRanking(ranking: string[][]): number[][] {
    const placeOf = new Map<string, number>();
    let place = 0;
    for (const g of ranking) {
      for (const id of g) placeOf.set(id, place);
      place += g.length;
    }
    const sums = new Map<number, { total: number; n: number; best: number }>();
    for (const [id, team] of this.teamOf!) {
      if (!placeOf.has(id)) continue;
      const s = sums.get(team) ?? { total: 0, n: 0, best: Infinity };
      s.total += placeOf.get(id)!;
      s.n++;
      s.best = Math.min(s.best, placeOf.get(id)!);
      sums.set(team, s);
    }
    // Place moyenne ; à égalité, l'équipe qui a le meilleur joueur passe devant.
    const avg = [...sums].map(([team, s]) => ({ team, avg: s.total / s.n, best: s.best })).sort((a, b) => a.avg - b.avg || a.best - b.best);
    const groups: number[][] = [];
    let prev: (typeof avg)[number] | null = null;
    for (const t of avg) {
      if (prev && Math.abs(prev.avg - t.avg) < 1e-9 && prev.best === t.best) groups.at(-1)!.push(t.team);
      else groups.push([t.team]);
      prev = t;
    }
    return groups;
  }

  /** Ordre de passage d'après un classement : par équipe, puis par place individuelle. */
  private orderFrom(ranking: string[][], tie: (a: string, b: string) => number): string[] {
    const individual = ranking.flatMap((group) => [...group].sort(tie));
    if (!this.teamOf) return individual;
    return this.teamRanking(ranking).flatMap((teams) => individual.filter((id) => teams.includes(this.teamOf!.get(id)!)));
  }

  start(): void {
    // Premier mini-jeu : il décide de l'ordre de jeu.
    if (!this.startMiniGame(this.players(), "ordre")) {
      this.order = this.players();
      this.beginBoardRound();
    }
  }

  protected standings(): Standing[] {
    return [...this.pawns.entries()].map(([playerId, pawn]) => ({
      playerId,
      lives: 0,
      score: pawn.coins,
      eliminated: !this.host.room.findPlayer(playerId),
    }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    const pawns: Record<string, PawnState> = {};
    const remaining: Record<string, number> = {};
    for (const [id, p] of this.pawns) {
      pawns[id] = { cell: p.cell, coins: p.coins, skipNext: p.skipNext, bonusDie: p.bonusDie, itemCount: p.items.length };
      remaining[id] = this.distances[p.cell] ?? 0;
    }
    return {
      board: {
        board: this.board,
        order: [...this.order],
        pawns,
        turn: this.turn ? structuredClone(this.turn) : null,
        boardRound: this.boardRound,
        remaining,
        config: this.config,
        teams: this.teamOf ? Object.fromEntries(this.teamOf) : null,
        scrambled: Math.max(0, this.scrambledUntil - this.boardRound + 1),
      },
    };
  }

  boardPrivate(playerId: string) {
    const pawn = this.pawns.get(playerId);
    return pawn ? { items: [...pawn.items] } : null;
  }

  private sendItems(playerId: string): void {
    const pawn = this.pawns.get(playerId);
    if (pawn) this.host.sendBoardPrivate?.(playerId, { items: [...pawn.items] });
  }

  playerRemoved(playerId: string): void {
    this.order = this.order.filter((id) => id !== playerId);
    this.readyIds.delete(playerId);
    if (this.turn?.playerId === playerId) this.nextTurn();
    else this.host.changed();
  }

  // ───────────── Mini-jeux ─────────────

  private players(): string[] {
    const inRoom = new Set(this.host.room.players.map((p) => p.id));
    return [...this.pawns.keys()].filter((id) => inRoom.has(id));
  }

  protected onMiniGameDone(ranking: string[][]): void {
    if (this.purpose === "duel") {
      // Le gagnant du duel prend la mise au perdant (rien en cas d'égalité).
      const changes: RoundResult["changes"] = [];
      if (ranking.length > 1) {
        const winner = ranking[0]![0]!;
        const loser = ranking[1]![0]!;
        const w = this.pawns.get(winner);
        const l = this.pawns.get(loser);
        if (w && l) {
          const stake = Math.min(l.coins, this.config.duelStake);
          l.coins -= stake;
          w.coins += stake;
          changes.push({ playerId: winner, points: stake }, { playerId: loser, points: -stake });
        }
      }
      this.showResults(ranking, changes, () => this.resumeBoard());
      return;
    }
    if (this.purpose === "defi") {
      const solo = this.turn?.playerId;
      const flat = ranking.map((g) => g.filter((id) => this.pawns.has(id))).filter((g) => g.length);
      const place = (id: string) => flat.findIndex((g) => g.includes(id));
      const others = this.participants.filter((id) => id !== solo);
      // Gagné s'il fait mieux que la place moyenne des autres (en duel : s'il est devant).
      const avg = others.reduce((s, id) => s + place(id), 0) / Math.max(1, others.length);
      const won = solo !== undefined && place(solo) >= 0 && place(solo) < avg;
      const changes: RoundResult["changes"] = solo ? [{ playerId: solo, points: won ? 1 : -1 }] : [];
      this.showResults(ranking, changes, () => {
        this.module = null;
        this.participants = [];
        if (!solo || !this.turn) return this.resumeBoard();
        if (won) return this.finish(solo);
        this.turn.phase = "effect";
        this.turn.effect = { type: "malus", text: `rate le défi final et redescend de ${FINAL_FALL} cases !` };
        this.setStage("board", BOARD_TIMINGS.effect);
        this.goTo(BOARD_TIMINGS.effect, () => this.moveBack(FINAL_FALL, () => this.resumeBoard()));
      });
      return;
    }
    if (this.purpose === "ordre") {
      // Le classement donne l'ordre ; les égalités sont départagées au hasard.
      this.order = this.orderFrom(ranking, () => this.host.random() - 0.5);
      this.showResults(ranking, [], () => this.beginBoardRound(), this.teamOf ? { teams: this.teamRanking(ranking) } : {});
      return;
    }
    // Chaque mini-jeu de fin de tour rapporte des pièces ET fixe le nouvel ordre de passage.
    const previous = [...this.order];
    this.order = this.orderFrom(ranking, (a, b) => previous.indexOf(a) - previous.indexOf(b));
    const withBonusDice = this.config.bonusDice;
    const changes: RoundResult["changes"] = [];
    let place = 0;
    if (this.teamOf) {
      // Équipes : les pièces vont une fois au porte-monnaie de chaque équipe, selon son classement.
      const teamGroups = this.teamRanking(ranking);
      for (const group of teamGroups) {
        const coins = coinsForPlace(place, teamGroups.length) * this.config.coinMultiplier;
        const die = withBonusDice ? bonusDieForPlace(place, teamGroups.length) : null;
        for (const team of group) {
          const members = this.players().filter((id) => this.teamOf!.get(id) === team);
          if (members[0]) this.pawns.get(members[0])!.coins += coins;
          for (const id of members) {
            this.pawns.get(id)!.bonusDie = die;
            changes.push({ playerId: id, points: coins, bonusDie: die ?? undefined });
          }
        }
        place++;
      }
      this.showResults(ranking, changes, () => this.beginBoardRound(), { teams: teamGroups });
      return;
    }
    for (const group of ranking) {
      const coins = coinsForPlace(place, ranking.length) * this.config.coinMultiplier;
      const die = withBonusDice ? bonusDieForPlace(place, ranking.length) : null;
      for (const id of group) {
        const pawn = this.pawns.get(id);
        if (!pawn) continue;
        pawn.coins += coins;
        pawn.bonusDie = die;
        changes.push({ playerId: id, points: coins, bonusDie: die ?? undefined });
      }
      place++;
    }
    this.showResults(ranking, changes, () => this.beginBoardRound());
  }

  // ───────────── Tours de plateau ─────────────

  private beginBoardRound(): void {
    if (this.disposed) return;
    this.boardRound++;
    this.turnIndex = -1;
    this.module = null;
    this.participants = [];
    this.turn = null;
    // Petite pause : les écrans annoncent « Tour X » avant le premier joueur.
    this.setStage("board", BOARD_TIMINGS.roundIntro);
    this.goTo(BOARD_TIMINGS.roundIntro, () => this.nextTurn());
  }

  private nextTurn(): void {
    if (this.disposed) return;
    this.order = this.order.filter((id) => this.host.room.findPlayer(id));
    this.turnIndex++;
    if (this.turnIndex >= this.order.length) {
      this.turn = null;
      // Limite de tours atteinte : le plus proche de l'arrivée gagne (à égalité, le plus riche).
      if (this.config.maxRounds > 0 && this.boardRound >= this.config.maxRounds) return this.podium(this.closestToFinish());
      // Tout le monde a joué : mini-jeu pour gagner des pièces (tous les N tours).
      if (this.boardRound % this.config.miniGameEvery !== 0) return this.beginBoardRound();
      if (!this.startMiniGame(this.players(), "pieces")) this.beginBoardRound();
      return;
    }
    const playerId = this.order[this.turnIndex]!;
    const pawn = this.pawns.get(playerId)!;
    if (pawn.skipNext) {
      pawn.skipNext = false;
      this.turn = this.newTurn(playerId, "effect");
      this.turn.effect = { type: "passe", text: "passe son tour (piège)." };
      this.setStage("board", BOARD_TIMINGS.effect);
      this.goTo(BOARD_TIMINGS.effect, () => this.nextTurn());
      return;
    }
    this.turn = this.newTurn(playerId, "roll");
    this.piped = null;
    this.shopsVisited.clear();
    const automatic = this.isBotOrAway(playerId);
    const wait = automatic ? BOARD_TIMINGS.botThink : BOARD_TIMINGS.rollTimeout;
    this.turn.endsAt = this.host.now() + wait;
    this.setStage("board", null);
    this.goTo(wait, () => (automatic ? this.botRoll() : this.roll()));
  }

  private closestToFinish(): string[] {
    const ids = this.players();
    const key = (id: string) => [this.distances[this.pawns.get(id)!.cell] ?? 0, -this.pawns.get(id)!.coins] as const;
    const best = ids.reduce((a, b) => {
      const [da, ca] = key(a);
      const [db, cb] = key(b);
      return db < da || (db === da && cb < ca) ? b : a;
    }, ids[0]!);
    const [d, c] = key(best);
    return [...new Set(ids.filter((id) => key(id)[0] === d && key(id)[1] === c).flatMap((id) => this.teamMates(id)))];
  }

  private newTurn(playerId: string, phase: BoardTurn["phase"]): BoardTurn {
    const bonus = this.pawns.get(playerId)?.bonusDie;
    return {
      playerId,
      phase,
      dice: null,
      rolls: [{ sides: 6, value: null, kind: "normal" }, ...(bonus ? [{ sides: bonus, value: null, kind: "bonus" as const }] : [])],
      usedItem: null,
      opponents: null,
      shop: null,
      path: [],
      moveId: this.moveId,
      choices: null,
      effect: null,
      endsAt: null,
    };
  }

  /** Action d'un joueur sur le plateau (objet, lancer, chemin, boutique). */
  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; cell?: unknown; item?: unknown; value?: unknown } | null;
    if (this.stage !== "board" || !this.turn) throw new RoomError(ERRORS.notYourTurn);
    if (this.turn.playerId !== playerId) throw new RoomError(ERRORS.notYourTurn);
    const phase = this.turn.phase;
    if (action?.type === "roll" && phase === "roll") return this.roll();
    if (action?.type === "choose" && phase === "choose" && typeof action.cell === "number") return this.choose(action.cell);
    if (action?.type === "item" && phase === "roll" && isItemId(action.item)) return this.useItem(playerId, action.item, action.value);
    if (action?.type === "buy" && phase === "shop" && isItemId(action.item)) return this.buy(playerId, action.item);
    if (action?.type === "leave" && phase === "shop") return this.leaveShop();
    const target = (raw as { target?: unknown } | null)?.target;
    if (action?.type === "duel" && phase === "duel" && typeof target === "string") return this.startDuel(target);
    throw new RoomError(ERRORS.badRequest);
  }

  // ───────────── Objets ─────────────

  private useItem(playerId: string, item: ItemId, value: unknown): void {
    const turn = this.turn!;
    const pawn = this.pawns.get(playerId)!;
    if (turn.usedItem) throw new RoomError(ERRORS.oneItemPerTurn);
    const index = pawn.items.indexOf(item);
    if (index < 0) throw new RoomError(ERRORS.badRequest);
    if (item === "de-pipe" && !(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6)) {
      throw new RoomError(ERRORS.badRequest);
    }
    pawn.items.splice(index, 1);
    turn.usedItem = item;
    const name = ITEMS[item].name;
    if (item === "de-pipe") {
      this.piped = value as number;
      turn.effect = { type: "objet", text: `utilise le ${name} : le dé fera ${value} !` };
    } else if (item === "de-12") {
      turn.rolls[0] = { sides: 12, value: null, kind: "douze" };
      turn.effect = { type: "objet", text: `utilise le ${name} !` };
    } else if (item === "aimant") {
      const coins = Object.fromEntries(this.holders(playerId).map((id) => [id, this.pawns.get(id)!.coins]));
      const { backfire, delta } = magnet(coins, playerId, this.host.random);
      for (const [id, d] of Object.entries(delta)) this.pawns.get(id)!.coins += d;
      const gain = delta[playerId]!;
      turn.effect = {
        type: "objet",
        text: backfire
          ? `utilise l'${name}… retour de flamme ! ${-gain} pièce${-gain > 1 ? "s" : ""} perdue${-gain > 1 ? "s" : ""}, partagée${-gain > 1 ? "s" : ""} entre les autres.`
          : `utilise l'${name} et attire ${gain} pièce${gain > 1 ? "s" : ""} !`,
      };
    } else {
      this.scrambledUntil = this.boardRound + SCRAMBLE_ROUNDS - 1;
      turn.effect = { type: "objet", text: `utilise le ${name} : informations cachées pendant ${SCRAMBLE_ROUNDS} tours !` };
    }
    this.sendItems(playerId);
    this.host.changed();
  }

  private canShop(pawn: Pawn): boolean {
    return pawn.items.length < this.config.maxItems && ITEM_IDS.some((id) => ITEMS[id].price <= pawn.coins);
  }

  private openShop(cell: number, then: () => void): void {
    const turn = this.turn!;
    this.shopsVisited.add(cell);
    turn.phase = "shop";
    turn.shop = { cell, offers: ITEM_IDS.map((item) => ({ item, price: ITEMS[item].price })) };
    const automatic = this.isBotOrAway(turn.playerId);
    const wait = automatic ? BOARD_TIMINGS.botThink * 1.5 : BOARD_TIMINGS.shopTimeout;
    turn.endsAt = this.host.now() + wait;
    this.afterShop = then;
    this.setStage("board", null);
    this.goTo(wait, () => {
      if (automatic) this.botShop(turn.playerId);
      this.leaveShop();
    });
  }

  private buy(playerId: string, item: ItemId): void {
    const pawn = this.pawns.get(playerId)!;
    if (pawn.items.length >= this.config.maxItems) throw new RoomError(ERRORS.itemsFull);
    if (pawn.coins < ITEMS[item].price) throw new RoomError(ERRORS.notEnoughCoins);
    pawn.coins -= ITEMS[item].price;
    pawn.items.push(item);
    this.sendItems(playerId);
    // Plus rien à acheter : on repart tout de suite.
    if (!this.canShop(pawn)) return this.leaveShop();
    this.host.changed();
  }

  private leaveShop(): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "shop") return;
    turn.shop = null;
    turn.phase = "move";
    turn.endsAt = null;
    const then = this.afterShop;
    this.afterShop = null;
    this.host.changed();
    then?.();
  }

  /** Achats d'un bot : un objet au hasard parmi ceux qu'il peut s'offrir (deux s'il est riche et agressif). */
  private botShop(playerId: string): void {
    const pawn = this.pawns.get(playerId)!;
    const greedy = this.host.room.findPlayer(playerId)?.botPersonality === "agressif";
    for (let i = 0; i < (greedy ? 2 : 1); i++) {
      const affordable = ITEM_IDS.filter((id) => ITEMS[id].price <= pawn.coins);
      if (!affordable.length || pawn.items.length >= this.config.maxItems) return;
      const item = affordable[Math.floor(this.host.random() * affordable.length)]!;
      pawn.coins -= ITEMS[item].price;
      pawn.items.push(item);
    }
    this.sendItems(playerId);
  }

  /** Un bot (ou un absent) utilise éventuellement un objet, puis lance le dé. */
  private botRoll(): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "roll") return;
    const choice = this.botItemChoice(turn.playerId);
    if (!choice) return this.roll();
    this.useItem(turn.playerId, choice.item, choice.value);
    this.goTo(BOARD_TIMINGS.itemShow, () => this.roll());
  }

  private botItemChoice(playerId: string): { item: ItemId; value?: number } | null {
    const pawn = this.pawns.get(playerId)!;
    const left = this.distances[pawn.cell] ?? 0;
    const othersCoins = [...this.pawns].filter(([id]) => id !== playerId).reduce((s, [, p]) => s + p.coins, 0);
    for (const item of pawn.items) {
      if (item === "de-pipe") {
        const value = this.bestPipedValue(pawn.cell);
        if (value.gain >= 3 || left <= 6) return { item, value: value.value };
      }
      if (item === "de-12" && left > 9) return { item };
      if (item === "aimant" && othersCoins >= 8) return { item };
      if (item === "brouilleur" && this.host.random() < 0.3) return { item };
    }
    return null;
  }

  /** Meilleure valeur de Dé pipé : atteindre l'arrivée, sinon une case bleue, en évitant rouge et violet. */
  private bestPipedValue(from: number): { value: number; gain: number } {
    let best = { value: 6, gain: 6 };
    for (let v = 1; v <= 6; v++) {
      let cell = from;
      for (let i = 0; i < v && cell !== this.board.finish; i++) cell = this.board.cells[cell]!.next[0]!;
      const type = this.board.cells[cell]!.type;
      const gain = cell === this.board.finish ? 100 : v + (type === "bonus" ? this.config.bonusSteps : type === "malus" ? -this.config.malusSteps : type === "piege" ? -4 : 0);
      if (gain > best.gain) best = { value: v, gain };
    }
    return best;
  }

  // ───────────── Dés et déplacements ─────────────

  private roll(): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "roll") return;
    turn.phase = "rolling";
    turn.effect = null;
    turn.endsAt = this.host.now() + BOARD_TIMINGS.rolling;
    this.host.changed();
    const piped = this.piped;
    this.piped = null;
    const values = turn.rolls.map((r) => (r.kind === "normal" && piped ? piped : 1 + Math.floor(this.host.random() * r.sides)));
    // Le dé bonus est consommé par ce lancer.
    const pawn = this.pawns.get(turn.playerId);
    if (pawn) pawn.bonusDie = null;
    this.goTo(BOARD_TIMINGS.rolling, () => {
      turn.rolls = turn.rolls.map((r, i) => ({ ...r, value: values[i]! }));
      // Double (deux dés identiques) : un 3e dé est lancé en plus.
      if (this.config.doubles && turn.rolls.length === 2 && values[0] === values[1]) {
        turn.rolls.push({ sides: 6, value: null, kind: "double" });
        turn.effect = { type: "objet", text: `fait un double ${values[0]} ! Un 3e dé est lancé.` };
        this.host.changed();
        const third = 1 + Math.floor(this.host.random() * 6);
        this.goTo(BOARD_TIMINGS.rolling, () => {
          turn.rolls[2] = { ...turn.rolls[2]!, value: third };
          this.afterRoll(turn);
        });
        return;
      }
      this.afterRoll(turn);
    });
  }

  private afterRoll(turn: BoardTurn): void {
    turn.dice = turn.rolls.reduce((a, r) => a + (r.value ?? 0), 0);
    this.pendingSteps = turn.dice;
    this.host.changed();
    // On laisse le temps de voir les dés retombés avant d'avancer.
    this.goTo(BOARD_TIMINGS.diceShow, () => {
      turn.effect = null;
      this.advance();
    });
  }

  /** Avance de `pendingSteps` cases, en s'arrêtant à un embranchement pour laisser choisir. */
  private advance(): void {
    const turn = this.turn!;
    const pawn = this.pawns.get(turn.playerId)!;
    const path: number[] = [];
    let shop = false;
    while (this.pendingSteps > 0 && pawn.cell !== this.board.finish) {
      const cell = this.board.cells[pawn.cell]!;
      if (cell.next.length > 1) {
        if (path.length) break; // on anime d'abord le trajet jusqu'à l'embranchement
        return this.askChoice();
      }
      pawn.cell = cell.next[0]!;
      pawn.trail.push(pawn.cell);
      path.push(pawn.cell);
      this.pendingSteps--;
      // Boutique sur le chemin : on s'y arrête (en passant ou en y finissant son déplacement).
      if (this.board.cells[pawn.cell]!.type === "boutique" && !this.shopsVisited.has(pawn.cell) && this.canShop(pawn)) {
        shop = true;
        break;
      }
    }
    const next = () => (this.pendingSteps > 0 ? this.advance() : this.land());
    this.animate(path, () => {
      if (pawn.cell === this.board.finish) return this.reachTop(turn.playerId);
      if (shop) return this.openShop(pawn.cell, next);
      next();
    });
  }

  private askChoice(): void {
    const turn = this.turn!;
    const pawn = this.pawns.get(turn.playerId)!;
    turn.phase = "choose";
    turn.choices = forkChoices(this.board, pawn.cell);
    const automatic = this.isBotOrAway(turn.playerId);
    const wait = automatic ? BOARD_TIMINGS.botThink : BOARD_TIMINGS.chooseTimeout;
    turn.endsAt = this.host.now() + wait;
    this.host.changed();
    this.goTo(wait, () => this.choose(this.botChoice(turn.playerId)));
  }

  private choose(cellId: number): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "choose" || !turn.choices?.some((c) => c.cell === cellId)) return;
    const pawn = this.pawns.get(turn.playerId)!;
    turn.choices = null;
    pawn.cell = cellId;
    pawn.trail.push(cellId);
    this.pendingSteps--;
    this.animate([cellId], () => {
      if (this.pendingSteps > 0) return this.advance();
      this.land();
    });
  }

  /** Choix d'un bot : le chemin le plus court, sauf erreur ou goût du risque. */
  private botChoice(playerId: string): number {
    const choices = forkChoices(this.board, this.pawns.get(playerId)!.cell)!;
    const p = this.host.room.findPlayer(playerId);
    const skill = botSkill({ personality: p?.botPersonality ?? "equilibre", difficulty: this.host.room.settings.botDifficulty });
    const shortest = [...choices].sort((a, b) => this.distances[a.cell]! - this.distances[b.cell]!)[0]!;
    const daring = p?.botPersonality === "agressif" ? 0.45 : 0.1;
    if (this.host.random() < daring) return choices.find((c) => c.detour)!.cell;
    if (this.host.random() > skill.accuracy) return choices[Math.floor(this.host.random() * choices.length)]!.cell;
    return shortest.cell;
  }

  /**
   * Effet de la case d'arrivée du déplacement.
   * `chained` : on arrive ici à cause d'un bonus ou d'un malus ; la case n'a alors aucun effet
   * (pas d'enchaînement bonus → malus → bonus…).
   */
  private land(chained = false): void {
    const turn = this.turn!;
    const pawn = this.pawns.get(turn.playerId)!;
    const cell = this.board.cells[pawn.cell]!;
    turn.phase = "effect";
    turn.choices = null;

    if (!chained && cell.type === "bonus") {
      const steps = this.config.bonusSteps;
      turn.effect = { type: "bonus", text: `Bonus ! +${steps} case${steps > 1 ? "s" : ""}.` };
      this.setStage("board", BOARD_TIMINGS.effect);
      this.goTo(BOARD_TIMINGS.effect, () => this.moveBy(steps, () => this.land(true)));
      return;
    }
    if (!chained && cell.type === "malus") {
      const steps = this.config.malusSteps;
      turn.effect = { type: "malus", text: `Malus ! −${steps} case${steps > 1 ? "s" : ""}.` };
      this.setStage("board", BOARD_TIMINGS.effect);
      this.goTo(BOARD_TIMINGS.effect, () => this.moveBack(steps, () => this.land(true)));
      return;
    }
    if (!chained && cell.type === "piege") {
      pawn.skipNext = true;
      turn.effect = { type: "piege", text: "Piège ! Tu passeras ton prochain tour." };
    } else if (!chained && cell.type === "ovni") {
      return this.ovni();
    } else if (!chained && cell.type === "evenement") {
      this.globalEvent();
    } else if (!chained && cell.type === "duel" && this.duelOpponents(turn.playerId).length) {
      return this.askDuel();
    } else if (chained && ["bonus", "malus", "piege", "ovni", "evenement", "duel"].includes(cell.type)) {
      turn.effect = { type: cell.type as "bonus", text: "Pas d'effet en chaîne : la case ne s'active pas.", blocked: pawn.cell };
    } else {
      turn.effect = null;
    }
    const pause = turn.effect ? BOARD_TIMINGS.effect : BOARD_TIMINGS.between;
    this.setStage("board", pause);
    this.goTo(pause, () => this.nextTurn());
  }

  // ───────────── OVNI, événements, duels ─────────────

  /** OVNI : un effet tiré au hasard (déplacement, échange de place, pièces). */
  private ovni(): void {
    const turn = this.turn!;
    const pawn = this.pawns.get(turn.playerId)!;
    const others = this.players().filter((id) => id !== turn.playerId);
    const roll = this.host.random();
    const show = (text: string, then: () => void) => {
      turn.effect = { type: "ovni", text };
      this.setStage("board", BOARD_TIMINGS.effect);
      this.goTo(BOARD_TIMINGS.effect, then);
    };
    const steps = 3 + Math.floor(this.host.random() * 8);
    if (roll < 0.3) return show(`Un OVNI t'emporte : +${steps} cases !`, () => this.moveBy(steps, () => this.land(true)));
    if (roll < 0.5) return show(`Un OVNI te dépose plus loin… en arrière : −${steps} cases !`, () => this.moveBack(steps, () => this.land(true)));
    if (roll < 0.7 && others.length) {
      const other = others[Math.floor(this.host.random() * others.length)]!;
      const them = this.pawns.get(other)!;
      return show(`L'OVNI échange ta place avec ${this.nameOf(other)} !`, () => {
        [pawn.cell, them.cell] = [them.cell, pawn.cell];
        [pawn.trail, them.trail] = [them.trail, pawn.trail];
        this.animate([pawn.cell], () => (pawn.cell === this.board.finish ? this.reachTop(turn.playerId) : this.land(true)));
      });
    }
    const amount = (5 + Math.floor(this.host.random() * 11)) * this.config.coinMultiplier;
    if (roll < 0.85) {
      pawn.coins += amount;
      return show(`L'OVNI te laisse un cadeau : +${amount} pièces !`, () => this.nextTurn());
    }
    const taken = Math.min(pawn.coins, amount);
    pawn.coins -= taken;
    show(`L'OVNI aspire ${taken} pièce${taken > 1 ? "s" : ""} !`, () => this.nextTurn());
  }

  /** Événement : un effet pour tout le monde. */
  private globalEvent(): void {
    const turn = this.turn!;
    const ids = this.players();
    const pawns = ids.map((id) => this.pawns.get(id)!);
    // Effets sur les pièces : un porte-monnaie par équipe (ou par joueur).
    const holders = this.holders();
    const wallets = holders.map((id) => this.pawns.get(id)!);
    const kind = Math.floor(this.host.random() * 5);
    let text: string;
    if (kind === 0) {
      const gift = 5 * this.config.coinMultiplier;
      for (const p of wallets) p.coins += gift;
      text = `Pluie de pièces ! ${this.teamOf ? "Chaque équipe gagne" : "Tout le monde gagne"} ${gift} pièces.`;
    } else if (kind === 1) {
      for (const p of pawns) for (let i = 0; i < 3 && p.trail.length > 1; i++) (p.trail.pop(), (p.cell = p.trail.at(-1)!));
      text = "Tremblement de terre ! Tout le monde recule de 3 cases.";
    } else if (kind === 2) {
      // Vent arrière : tout le monde avance de 3 cases, sans pouvoir franchir l'arrivée.
      for (const p of pawns) {
        for (let i = 0; i < 3; i++) {
          const next = this.board.cells[p.cell]!.next[0];
          if (next === undefined || next === this.board.finish) break;
          p.cell = next;
          p.trail.push(next);
        }
      }
      text = "Vent arrière ! Tout le monde avance de 3 cases.";
    } else if (kind === 3) {
      const total = wallets.reduce((s, p) => s + p.coins, 0);
      const share = Math.floor(total / wallets.length);
      let rest = total - share * wallets.length;
      for (const p of wallets) p.coins = share + (rest-- > 0 ? 1 : 0);
      text = `Redistribution ! Les pièces sont partagées : ${share} ${this.teamOf ? "par équipe" : "chacun"}.`;
    } else {
      const sorted = [...holders].sort((a, b) => this.pawns.get(b)!.coins - this.pawns.get(a)!.coins);
      const rich = this.pawns.get(sorted[0]!)!;
      const poor = this.pawns.get(sorted.at(-1)!)!;
      const tax = Math.min(rich.coins, 10 * this.config.coinMultiplier);
      rich.coins -= tax;
      poor.coins += tax;
      text = `Impôt solidaire ! ${this.teamLabel(sorted[0]!)} donne ${tax} pièces à ${this.teamLabel(sorted.at(-1)!)}.`;
    }
    turn.effect = { type: "evenement", text };
  }

  /** Case duel : le joueur choisit son adversaire (les bots visent le plus riche). */
  private askDuel(): void {
    const turn = this.turn!;
    turn.phase = "duel";
    turn.opponents = this.duelOpponents(turn.playerId);
    turn.effect = null;
    const automatic = this.isBotOrAway(turn.playerId);
    const wait = automatic ? BOARD_TIMINGS.botThink : BOARD_TIMINGS.chooseTimeout;
    turn.endsAt = this.host.now() + wait;
    this.setStage("board", null);
    this.goTo(wait, () => this.startDuel(this.richestOpponent()));
  }

  /** Adversaires possibles d'un duel : jamais un coéquipier. */
  private duelOpponents(id: string): string[] {
    const mates = new Set(this.teamMates(id));
    return this.players().filter((p) => !mates.has(p));
  }

  private richestOpponent(): string {
    const turn = this.turn!;
    return [...(turn.opponents ?? [])].sort((a, b) => this.pawns.get(b)!.coins - this.pawns.get(a)!.coins)[0]!;
  }

  private startDuel(target: string): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "duel" || !turn.opponents?.includes(target)) return;
    turn.phase = "effect";
    turn.opponents = null;
    turn.endsAt = null;
    turn.effect = { type: "duel", text: `défie ${this.nameOf(target)} en duel ! Mise : ${this.config.duelStake} pièces.` };
    this.duelists = [turn.playerId, target];
    this.setStage("board", BOARD_TIMINGS.effect);
    this.goTo(BOARD_TIMINGS.effect, () => {
      if (!this.startMiniGame(this.duelists.filter((id) => this.host.room.findPlayer(id)), "duel")) this.resumeBoard();
    });
  }

  /** Retour au plateau après un duel : on continue avec le joueur suivant. */
  private resumeBoard(): void {
    if (this.disposed) return;
    this.module = null;
    this.participants = [];
    this.turn = null;
    this.nextTurn();
  }

  /** Nom du joueur, ou de son équipe en mode équipes. */
  private teamLabel(id: string): string {
    const team = this.teamOf?.get(id);
    return team === undefined ? this.nameOf(id) : (TEAMS[team]?.label ?? this.nameOf(id));
  }

  private nameOf(id: string): string {
    return this.host.room.findPlayer(id)?.name ?? "?";
  }

  /** Bonus : avance sans s'arrêter aux embranchements (on reste sur le chemin principal). */
  private moveBy(steps: number, then: () => void): void {
    const pawn = this.pawns.get(this.turn!.playerId)!;
    const path: number[] = [];
    for (let i = 0; i < steps && pawn.cell !== this.board.finish; i++) {
      pawn.cell = this.board.cells[pawn.cell]!.next[0]!;
      pawn.trail.push(pawn.cell);
      path.push(pawn.cell);
    }
    this.animate(path, () => (pawn.cell === this.board.finish ? this.reachTop(this.turn!.playerId) : then()));
  }

  /** Malus : recule en refaisant son propre chemin à l'envers. */
  private moveBack(steps: number, then: () => void): void {
    const pawn = this.pawns.get(this.turn!.playerId)!;
    const path: number[] = [];
    for (let i = 0; i < steps && pawn.trail.length > 1; i++) {
      pawn.trail.pop();
      pawn.cell = pawn.trail.at(-1)!;
      path.push(pawn.cell);
    }
    this.animate(path, then);
  }

  private animate(path: number[], then: () => void): void {
    const turn = this.turn!;
    if (!path.length) return then();
    turn.phase = turn.phase === "effect" ? "effect" : "move";
    turn.path = path;
    turn.moveId = ++this.moveId;
    turn.endsAt = null;
    this.setStage("board", null);
    this.goTo(path.length * BOARD_TIMINGS.step + 250, then);
  }

  /** Arrivée au sommet : défi final (seul contre tous) si la règle est active, sinon victoire. */
  private reachTop(id: string): void {
    const others = this.players().filter((p) => p !== id && !(this.teamOf && this.teamOf.get(p) === this.teamOf.get(id)));
    if (!this.config.finalChallenge || !others.length) return this.finish(id);
    const turn = this.turn!;
    turn.phase = "effect";
    turn.effect = { type: "arrivee", text: "atteint le sommet ! Défi final : gagner le mini-jeu seul contre tous." };
    this.setStage("board", BOARD_TIMINGS.effect);
    this.goTo(BOARD_TIMINGS.effect, () => {
      if (!this.startMiniGame([id, ...others], "defi")) this.finish(id);
    });
  }

  private finish(winner: string): void {
    const turn = this.turn!;
    turn.phase = "effect";
    turn.effect = { type: "arrivee", text: this.teamOf ? `Arrivée ! Victoire de l'${TEAMS[this.teamOf.get(winner)!]?.label ?? "équipe"} !` : "Arrivée ! Victoire !" };
    this.setStage("board", BOARD_TIMINGS.effect);
    this.goTo(BOARD_TIMINGS.effect, () => {
      this.turn = null;
      this.podium(this.teamMates(winner));
    });
  }
}

export const plateauMode: GameModeModule = {
  id: "plateau",
  create: (host) => new BoardGame(host),
};
