import {
  CARD_INFO, DESTINATIONS, ERRORS, GLOBE_HAND_MAX, GLOBE_MAP, GLOBE_ROW, GLOBE_SIZE, GLOBE_START_COINS, ORDER_COINS, PHOTO_PRICE,
  ROW_VALUES, SURPRISES, TRAVEL_FEE, cardLabel, globeDistances, globeReachable,
  type GameSnapshot, type GlobeChoice, type GlobePhoto, type GlobeTurn, type RoundResult, type Standing, type SurpriseKind, type TravelCard,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const GLOBE_TIMINGS = {
  intro: 3500,
  /** Durée d'une case pendant un déplacement (animation). */
  step: 320,
  reveal: 1500,
  spin: 2400,
  result: 2600,
  cardTimeout: 30_000,
  choiceTimeout: 20_000,
  botThink: 1300,
};

const MAX_OVERTIME = 10;
const AIRPORTS = GLOBE_MAP.filter((s) => s.kind === "aeroport").map((s) => s.id);
const PORTS = GLOBE_MAP.filter((s) => s.kind === "port").map((s) => s.id);
const DESTINATION_SPACES = GLOBE_MAP.filter((s) => s.kind === "destination").map((s) => s.id);
/** Distances entre toutes les cases (calculées une fois). */
const DIST = GLOBE_MAP.map((s) => globeDistances(s.id));

export function globeDistance(a: number, b: number): number {
  return DIST[a]![b]!;
}

type Pending =
  | { kind: "card" }
  | { kind: "move"; steps: number; options: Map<number, number[]>; label: string }
  | { kind: "airport" | "port"; options: number[]; fee: number }
  | { kind: "shop"; offers: TravelCard[] }
  | { kind: "super"; options: number[] };

/**
 * Mode « Tour du monde » : chacun part de Paris avec 10 pièces. Chaque tour commence par un
 * mini-jeu qui rapporte des pièces (10/5/3/1) et fixe l'ordre de passage. À son tour, on retourne
 * une des 5 cartes face cachée de la rangée commune (ou on joue une carte de transport achetée)
 * et on choisit sa case d'arrivée parmi celles situées à exactement ce nombre de cases, sur un
 * réseau de chemins avec embranchements. Un voyage à thème propose 3 destinations : passer par
 * l'une d'elles avec 10 pièces rapporte sa photo-souvenir. Quand les 3 sont visitées, un nouveau
 * voyage commence. Après les tours prévus, prolongations : la première photo termine la partie.
 */
export class GlobeGame extends BaseGame {
  protected readonly mode = "voyage" as const;
  private positions = new Map<string, number>();
  private coins = new Map<string, number>();
  private hands = new Map<string, TravelCard[]>();
  private photos = new Map<string, GlobePhoto[]>();
  private hotspots: { space: number; photo: number }[] = [];
  /** Rangée commune : valeurs cachées des cartes. */
  private row: number[] = [];
  private trip = 0;
  private order: string[];
  private globeRound = 0;
  private overtime = 0;
  private turnIndex = -1;
  private turn: GlobeTurn | null = null;
  private pending: Pending | null = null;
  private moveId = 0;
  private spinId = 0;
  private readonly rounds: number;
  private miniGameKind: "ordre" | "unvstous" | null = null;
  private soloId: string | null = null;
  private finishing = false;
  /** Photos déjà prises (destination:photo) : on ne les repropose pas tout de suite. */
  private takenPhotos = new Set<string>();

  constructor(host: GameHost) {
    super(host);
    this.rounds = host.room.settings.voyage.rounds;
    for (const p of host.room.players) {
      this.positions.set(p.id, 0);
      this.coins.set(p.id, GLOBE_START_COINS);
      this.hands.set(p.id, []);
      this.photos.set(p.id, []);
    }
    this.order = [...this.positions.keys()];
    while (this.row.length < GLOBE_ROW) this.row.push(this.drawValue());
    this.refreshHotspots();
  }

  start(): void {
    this.setStage("globe", GLOBE_TIMINGS.intro);
    this.goTo(GLOBE_TIMINGS.intro, () => this.beginRound());
  }

  protected standings(): Standing[] {
    return [...this.photos].map(([playerId, photos]) => ({ playerId, lives: 0, score: photos.length, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      globe: {
        map: GLOBE_MAP,
        positions: Object.fromEntries(this.positions),
        coins: Object.fromEntries(this.coins),
        hands: Object.fromEntries([...this.hands].map(([id, h]) => [id, h.map((c) => ({ ...c }))])),
        photos: Object.fromEntries([...this.photos].map(([id, p]) => [id, p.map((x) => ({ ...x }))])),
        hotspots: this.hotspots.map((h) => ({ ...h })),
        row: this.row.length,
        trip: this.trip,
        order: [...this.order],
        turn: this.turn ? structuredClone(this.turn) : null,
        round: this.globeRound,
        rounds: this.rounds,
        overtime: this.overtime,
      },
    };
  }

  playerRemoved(playerId: string): void {
    this.order = this.order.filter((id) => id !== playerId);
    this.readyIds.delete(playerId);
    if (this.turn?.playerId === playerId && this.stage === "globe") this.nextTurn();
    else this.host.changed();
  }

  private players(): string[] {
    return this.order.filter((id) => this.host.room.findPlayer(id));
  }

  private name(id: string): string {
    return this.host.room.findPlayer(id)?.name ?? "?";
  }

  private addCoins(id: string, n: number): number {
    const before = this.coins.get(id) ?? 0;
    const after = Math.max(0, before + n);
    this.coins.set(id, after);
    return after - before;
  }

  private drawValue(): number {
    return ROW_VALUES[Math.floor(this.host.random() * ROW_VALUES.length)]!;
  }

  private randomCard(): TravelCard {
    const r = this.host.random();
    if (r < 0.4) return { kind: "train", value: 4 + Math.floor(this.host.random() * 3) };
    if (r < 0.55) return { kind: "taxi" };
    if (r < 0.7) return { kind: "montgolfiere" };
    if (r < 0.82) return { kind: "helico", value: 8 };
    if (r < 0.95) return { kind: "avion" };
    return { kind: "super" };
  }

  private giveCard(id: string, card: TravelCard): boolean {
    const hand = this.hands.get(id)!;
    if (hand.length >= GLOBE_HAND_MAX) return false;
    hand.push(card);
    return true;
  }

  /** Nouveau voyage à thème : trois destinations, chacune avec une photo pas encore prise. */
  private refreshHotspots(): void {
    this.trip++;
    const occupied = new Set(this.positions.values());
    const pool = DESTINATION_SPACES.filter((s) => !occupied.has(s)).sort(() => this.host.random() - 0.5);
    this.hotspots = pool.slice(0, 3).map((space) => {
      const dest = GLOBE_MAP[space]!.destination!;
      const free = [0, 1, 2].filter((p) => !this.takenPhotos.has(`${dest}:${p}`));
      const photo = (free.length ? free : [0, 1, 2])[Math.floor(this.host.random() * (free.length || 3))]!;
      return { space, photo };
    });
  }

  // ───────────── Tours ─────────────

  private beginRound(): void {
    if (this.disposed) return;
    this.globeRound++;
    if (this.globeRound > this.rounds) {
      this.overtime++;
      if (this.overtime > Math.min(MAX_OVERTIME, this.rounds)) return this.end();
    }
    this.turn = null;
    this.turnIndex = -1;
    // Mini-jeu de début de tour : il rapporte des pièces et fixe l'ordre de passage.
    this.miniGameKind = "ordre";
    if (!this.startMiniGame(this.players(), "voyage")) {
      this.miniGameKind = null;
      this.nextTurn();
    }
  }

  private nextTurn(): void {
    if (this.disposed) return;
    this.module = null;
    this.participants = [];
    if (this.finishing) return this.end();
    const players = this.players();
    this.turnIndex++;
    if (this.turnIndex >= players.length) return this.beginRound();
    const playerId = players[this.turnIndex]!;
    this.turn = { playerId, choice: null, text: null, path: [], moveId: this.moveId, endsAt: null };
    this.ask({ kind: "card" });
  }

  /** Attend une décision du joueur (ou d'un bot), avec choix automatique au bout du délai. */
  private ask(pending: Pending): void {
    const turn = this.turn!;
    this.pending = pending;
    const choice: GlobeChoice =
      pending.kind === "card"
        ? { type: "card" }
        : pending.kind === "move"
          ? { type: "move", steps: pending.steps, options: [...pending.options.keys()] }
          : pending.kind === "shop"
            ? { type: "shop", offers: pending.offers }
            : pending.kind === "super"
              ? { type: "super", options: pending.options }
              : { type: pending.kind === "airport" ? "airport" : "port", options: pending.options, fee: pending.fee };
    turn.choice = choice;
    const bot = this.isBotOrAway(turn.playerId);
    const wait = bot ? GLOBE_TIMINGS.botThink : pending.kind === "card" ? GLOBE_TIMINGS.cardTimeout : GLOBE_TIMINGS.choiceTimeout;
    turn.endsAt = this.host.now() + wait;
    this.setStage("globe", null);
    this.goTo(wait, () => this.autoDecide());
  }

  action(playerId: string, raw: unknown): void {
    const a = raw as { type?: unknown; index?: unknown; slot?: unknown; steps?: unknown; space?: unknown } | null;
    const turn = this.turn;
    const pending = this.pending;
    if (this.stage !== "globe" || !turn || !pending || turn.playerId !== playerId || !a) throw new RoomError(ERRORS.notYourTurn);
    const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : undefined);
    if (pending.kind === "card" && a.type === "draw") {
      const slot = int(a.slot, this.row.length);
      if (slot === undefined) throw new RoomError(ERRORS.badRequest);
      return this.draw(slot);
    }
    if (pending.kind === "card" && a.type === "card") {
      const hand = this.hands.get(playerId)!;
      const index = int(a.index, hand.length);
      if (index === undefined) throw new RoomError(ERRORS.badRequest);
      const card = hand[index]!;
      const steps = Number(a.steps);
      if (card.kind === "taxi" && !(Number.isInteger(steps) && steps >= 1 && steps <= 3)) throw new RoomError(ERRORS.badRequest);
      if (card.kind === "super" && (this.coins.get(playerId) ?? 0) < PHOTO_PRICE) throw new RoomError("Il te faut 10 pièces pour la photo !");
      return this.playCard(index, card.kind === "taxi" ? steps : undefined);
    }
    if (pending.kind === "move" && a.type === "move") {
      if (!pending.options.has(a.space as number)) throw new RoomError(ERRORS.badRequest);
      return this.moveTo(a.space as number);
    }
    if ((pending.kind === "airport" || pending.kind === "port") && a.type === "travel") {
      if (a.space !== null && !pending.options.includes(a.space as number)) throw new RoomError(ERRORS.badRequest);
      return this.travel(a.space as number | null, pending.kind, pending.fee);
    }
    if (pending.kind === "super" && a.type === "travel" && pending.options.includes(a.space as number)) return this.teleport(a.space as number, "🌟 Super voyage");
    if (pending.kind === "shop" && a.type === "shop") {
      if (a.index !== null && int(a.index, pending.offers.length) === undefined) throw new RoomError(ERRORS.badRequest);
      return this.buy(a.index as number | null);
    }
    throw new RoomError(ERRORS.badRequest);
  }

  // ───────────── Décisions des bots (et choix automatiques) ─────────────

  /** Distance de la case à la destination à la une la plus proche. */
  private nearHot(space: number): number {
    return Math.min(...this.hotspots.map((h) => globeDistance(space, h.space)), GLOBE_SIZE);
  }

  /** Valeur d'une arrivée : une photo en chemin, sinon se rapprocher d'une destination à la une. */
  private pathValue(id: string, path: number[]): number {
    const coins = this.coins.get(id) ?? 0;
    const hot = this.hotspots.map((h) => h.space);
    if (coins >= PHOTO_PRICE && path.some((s) => hot.includes(s))) return 100;
    const end = path.at(-1)!;
    const kind = GLOBE_MAP[end]!.kind;
    const bonus = kind === "boulot" || kind === "gare" ? 3 : kind === "surprise" ? 1 : kind === "boutique" && coins >= 15 ? 2 : kind === "aeroport" && coins >= 5 ? 2 : 0;
    return 40 - this.nearHot(end) + bonus;
  }

  private autoDecide(): void {
    const turn = this.turn;
    const pending = this.pending;
    if (!turn || !pending) return;
    const id = turn.playerId;
    const coins = this.coins.get(id) ?? 0;
    const pos = this.positions.get(id)!;
    const nearest = (spaces: number[]) => [...spaces].sort((a, b) => this.nearHot(a) - this.nearHot(b))[0]!;
    switch (pending.kind) {
      case "card": {
        // Une carte de transport vraiment utile (photo à portée), sinon une carte de la rangée.
        const hand = this.hands.get(id)!;
        let best: { score: number; index: number; steps?: number } | null = null;
        const best3 = (n: number) => Math.max(...[...globeReachable(pos, n).values()].map((p) => this.pathValue(id, p)));
        hand.forEach((card, i) => {
          let score = -1e9;
          let steps: number | undefined;
          if (card.kind === "train" || card.kind === "helico") score = best3(card.value ?? 8);
          else if (card.kind === "taxi") {
            for (const n of [1, 2, 3]) if (best3(n) > score) (score = best3(n)), (steps = n);
          }
          else if (card.kind === "avion") score = 40 - this.nearHot(nearest(AIRPORTS)) - 2;
          else if (card.kind === "super") score = coins >= PHOTO_PRICE ? 120 : -1e9;
          if (!best || score > best.score) best = { score, index: i, steps };
        });
        const chosen = best as { score: number; index: number; steps?: number } | null;
        if (chosen && chosen.score >= 100) return this.playCard(chosen.index, chosen.steps);
        return this.draw(Math.floor(this.host.random() * this.row.length));
      }
      case "move": {
        let target = [...pending.options.keys()][0]!;
        let score = -1e9;
        for (const [space, path] of pending.options) {
          const v = this.pathValue(id, path) + this.host.random() * 0.5;
          if (v > score) (score = v), (target = space);
        }
        return this.moveTo(target);
      }
      case "airport":
      case "port": {
        const here = this.nearHot(pos);
        const target = nearest(pending.options);
        const there = this.nearHot(target);
        // Avion (carte déjà payée) : on part toujours, vers l'aéroport le plus utile.
        if (pending.fee === 0) return this.travel(target, pending.kind, 0);
        const worth = this.isBotOrAway(id) && coins >= pending.fee && there + 4 < here && (coins - pending.fee >= PHOTO_PRICE || coins < PHOTO_PRICE);
        return this.travel(worth ? target : null, pending.kind, pending.fee);
      }
      case "shop": {
        if (!this.isBotOrAway(id)) return this.buy(null);
        const pref = ["super", "helico", "train", "avion", "taxi", "montgolfiere"];
        const affordable = pending.offers
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => CARD_INFO[c.kind].price <= coins - (coins >= PHOTO_PRICE + 5 ? PHOTO_PRICE : 0))
          .sort((a, b) => pref.indexOf(a.c.kind) - pref.indexOf(b.c.kind));
        const handFull = this.hands.get(id)!.length >= GLOBE_HAND_MAX;
        return this.buy(!handFull && affordable[0] && (this.hands.get(id)!.length < 2 || affordable[0].c.kind === "super") ? affordable[0].i : null);
      }
      case "super":
        return this.teleport(nearest(pending.options), "🌟 Super voyage");
    }
  }

  // ───────────── Déplacements ─────────────

  /** Retourne une carte de la rangée : elle est remplacée, et on choisit sa case d'arrivée. */
  private draw(slot: number): void {
    const turn = this.turn!;
    const value = this.row[slot]!;
    this.row[slot] = this.drawValue();
    turn.choice = null;
    turn.endsAt = null;
    this.pending = null;
    turn.reveal = { slot, value };
    turn.text = `retourne une carte : ${value} case${value > 1 ? "s" : ""} !`;
    this.setStage("globe", GLOBE_TIMINGS.reveal);
    this.goTo(GLOBE_TIMINGS.reveal, () => this.askMove(value, `avance de ${value} case${value > 1 ? "s" : ""}.`));
  }

  /** Propose les cases à exactement `steps` cases. */
  private askMove(steps: number, label: string, maxSteps = steps): void {
    const turn = this.turn!;
    const pos = this.positions.get(turn.playerId)!;
    const options = new Map<number, number[]>();
    for (let n = steps; n <= maxSteps; n++) for (const [k, v] of globeReachable(pos, n)) if (!options.has(k)) options.set(k, v);
    turn.text = `choisit sa case d'arrivée (${steps === maxSteps ? steps : `${steps} à ${maxSteps}`} case${maxSteps > 1 ? "s" : ""}).`;
    this.ask({ kind: "move", steps: maxSteps, options, label });
  }

  private playCard(index: number, steps?: number): void {
    const turn = this.turn!;
    const id = turn.playerId;
    this.pending = null;
    turn.choice = null;
    turn.endsAt = null;
    turn.reveal = undefined;
    const card = this.hands.get(id)!.splice(index, 1)[0]!;
    const pos = this.positions.get(id)!;
    switch (card.kind) {
      case "train":
      case "helico":
        return this.askMove(card.value ?? 8, `prend le ${cardLabel(card).toLowerCase()} : ${card.value} cases.`);
      case "taxi":
        return this.askMove(steps ?? 1, `prend un taxi : ${steps} case${(steps ?? 1) > 1 ? "s" : ""}.`);
      case "montgolfiere": {
        const n = 3 + Math.floor(this.host.random() * 6);
        turn.spin = { kind: "montgolfiere", value: n, id: ++this.spinId };
        turn.text = "monte en montgolfière : la roue tourne…";
        this.setStage("globe", GLOBE_TIMINGS.spin);
        this.goTo(GLOBE_TIMINGS.spin, () => this.askMove(n, `vole en montgolfière : ${n} cases !`));
        return;
      }
      case "avion":
        turn.text = "prend l'avion ✈️ : vers quel aéroport ?";
        return this.ask({ kind: "airport", options: AIRPORTS.filter((s) => s !== pos), fee: 0 });
      case "super":
        turn.text = "utilise un Super voyage 🌟 : quelle destination ?";
        return this.ask({ kind: "super", options: this.hotspots.map((h) => h.space) });
    }
  }

  private moveTo(space: number): void {
    const pending = this.pending;
    if (pending?.kind !== "move") return;
    const path = pending.options.get(space)!;
    this.move(path, pending.label);
  }

  /** Avance case par case (animation), achète les photos en passant, puis applique la case d'arrivée. */
  private move(path: number[], text: string): void {
    const turn = this.turn!;
    const id = turn.playerId;
    this.pending = null;
    turn.choice = null;
    turn.endsAt = null;
    turn.path = path;
    turn.moveId = ++this.moveId;
    turn.text = text;
    turn.spin = undefined;
    this.positions.set(id, path.at(-1)!);
    const bought = path.map((s) => this.tryPhoto(id, s)).filter(Boolean);
    const duration = path.length * GLOBE_TIMINGS.step + 300;
    this.setStage("globe", duration);
    this.goTo(duration, () => this.land(bought as string[]));
  }

  private teleport(space: number, how: string): void {
    const turn = this.turn!;
    turn.choice = null;
    this.pending = null;
    this.positions.set(turn.playerId, space);
    turn.path = [space];
    turn.moveId = ++this.moveId;
    turn.text = `${how} : direction ${GLOBE_MAP[space]!.destination !== undefined ? DESTINATIONS[GLOBE_MAP[space]!.destination!]!.name : "l'autre bout du monde"} !`;
    const bought = this.tryPhoto(turn.playerId, space);
    this.setStage("globe", GLOBE_TIMINGS.result);
    this.goTo(GLOBE_TIMINGS.result, () => this.land(bought ? [bought] : [], true));
  }

  /** Photo-souvenir si la case est une destination à la une et qu'on a 10 pièces. */
  private tryPhoto(id: string, space: number): string | null {
    const hot = this.hotspots.findIndex((h) => h.space === space);
    if (hot < 0 || (this.coins.get(id) ?? 0) < PHOTO_PRICE) return null;
    const { photo } = this.hotspots[hot]!;
    const dest = GLOBE_MAP[space]!.destination!;
    this.addCoins(id, -PHOTO_PRICE);
    this.photos.get(id)!.push({ destination: dest, photo });
    this.takenPhotos.add(`${dest}:${photo}`);
    this.hotspots.splice(hot, 1);
    if (!this.hotspots.length) this.refreshHotspots();
    if (this.overtime > 0) this.finishing = true;
    return `${DESTINATIONS[dest]!.flag} ${DESTINATIONS[dest]!.photos[photo]}`;
  }

  private land(bought: string[], skipSpace = false): void {
    const turn = this.turn!;
    const id = turn.playerId;
    const space = GLOBE_MAP[this.positions.get(id)!]!;
    const prefix = bought.length ? `photo-souvenir : ${bought.join(", ")} ! ` : "";
    const done = (text: string) => this.show(prefix + text);
    if (skipSpace) return done(bought.length ? "" : "arrive à destination.");
    switch (space.kind) {
      case "depart": {
        const card = this.randomCard();
        return done(this.giveCard(id, card) ? `passe à Paris et reçoit une carte ${cardLabel(card)}.` : "est à Paris (main pleine).");
      }
      case "gare": {
        const card: TravelCard = { kind: "train", value: 4 + Math.floor(this.host.random() * 3) };
        return done(this.giveCard(id, card) ? `reçoit une carte ${cardLabel(card)} à la gare.` : "est à la gare, mais sa main est pleine.");
      }
      case "boulot": {
        const n = 1 + Math.floor(this.host.random() * 10);
        turn.spin = { kind: "boulot", value: n, id: ++this.spinId };
        turn.text = prefix + "fait un petit boulot : la roue tourne…";
        this.setStage("globe", GLOBE_TIMINGS.spin);
        this.goTo(GLOBE_TIMINGS.spin, () => {
          this.addCoins(id, n);
          this.show(`${prefix}gagne ${n} pièce${n > 1 ? "s" : ""} en petit boulot !`);
        });
        return;
      }
      case "boutique":
        turn.text = `${prefix}entre dans une boutique.`;
        return this.ask({ kind: "shop", offers: [this.randomCard(), this.randomCard(), this.randomCard()] });
      case "aeroport":
      case "port": {
        const all = space.kind === "aeroport" ? AIRPORTS : PORTS;
        if ((this.coins.get(id) ?? 0) < TRAVEL_FEE) return done(`est ${space.kind === "aeroport" ? "à l'aéroport" : "au port"}, mais n'a pas 5 pièces pour partir.`);
        turn.text = `${prefix}${space.kind === "aeroport" ? "est à l'aéroport : s'envoler" : "est au port : traverser"} pour 5 pièces ?`;
        return this.ask({ kind: space.kind === "aeroport" ? "airport" : "port", options: all.filter((s) => s !== space.id), fee: TRAVEL_FEE });
      }
      case "surprise":
        return done(prefix + this.surprise(id));
      case "unvstous": {
        const others = this.players().filter((p) => p !== id);
        if (!others.length) return done(prefix + "voudrait un 1 contre tous… mais il est seul !");
        turn.text = `${prefix}joue seul contre tous ! Victoire : 15 pièces. Défaite : 5 pièces pour chaque adversaire.`;
        this.setStage("globe", GLOBE_TIMINGS.result);
        this.goTo(GLOBE_TIMINGS.result, () => {
          this.miniGameKind = "unvstous";
          this.soloId = id;
          if (!this.startMiniGame(this.players(), "unvstous")) {
            this.miniGameKind = null;
            this.nextTurn();
          }
        });
        return;
      }
      case "destination":
        return done(bought.length ? "" : "visite la destination.");
    }
  }

  private travel(space: number | null, kind: "airport" | "port", fee: number): void {
    const turn = this.turn!;
    turn.choice = null;
    this.pending = null;
    if (space === null) {
      // Avion joué sans choisir : on reste sur place.
      return this.show(kind === "airport" ? "reste à l'aéroport." : "reste au port.");
    }
    if (fee) this.addCoins(turn.playerId, -fee);
    this.positions.set(turn.playerId, space);
    turn.path = [space];
    turn.moveId = ++this.moveId;
    turn.text = kind === "airport" ? "s'envole ✈️ vers un autre aéroport !" : "traverse l'océan ⛴️ !";
    this.setStage("globe", GLOBE_TIMINGS.result);
    this.goTo(GLOBE_TIMINGS.result, () => this.show(kind === "airport" ? "atterrit." : "accoste."));
  }

  private buy(index: number | null): void {
    const turn = this.turn!;
    const pending = this.pending;
    turn.choice = null;
    this.pending = null;
    if (index === null || pending?.kind !== "shop") return this.show("ressort de la boutique sans rien acheter.");
    const card = pending.offers[index]!;
    const price = CARD_INFO[card.kind].price;
    if ((this.coins.get(turn.playerId) ?? 0) < price) return this.show("n'a pas assez de pièces pour cette carte.");
    if (!this.giveCard(turn.playerId, card)) return this.show("a déjà la main pleine.");
    this.addCoins(turn.playerId, -price);
    this.show(`achète une carte ${cardLabel(card)} pour ${price} pièces.`);
  }

  private surprise(id: string): string {
    const others = this.players().filter((p) => p !== id);
    const kinds = (Object.keys(SURPRISES) as SurpriseKind[]).filter((k) => (SURPRISES[k].fromRound ?? 0) <= this.globeRound);
    const kind = kinds[Math.floor(this.host.random() * kinds.length)]!;
    const pick = () => others[Math.floor(this.host.random() * others.length)];
    const label = `Surprise « ${SURPRISES[kind].label} » : `;
    switch (kind) {
      case "collecte": {
        const o = pick();
        if (!o) return label + "personne à qui demander.";
        const n = -this.addCoins(o, -5);
        this.addCoins(id, n);
        return label + `${this.name(o)} lui donne ${n} pièce${n > 1 ? "s" : ""}.`;
      }
      case "cadeaux": {
        let total = 0;
        for (const o of others) {
          const n = -this.addCoins(o, -(1 + Math.floor(this.host.random() * 6)));
          total += n;
        }
        this.addCoins(id, total);
        return label + `chaque adversaire lui offre des pièces : ${total} au total !`;
      }
      case "partage": {
        const all = this.players();
        const sum = all.reduce((s, p) => s + (this.coins.get(p) ?? 0), 0);
        for (const p of all) this.coins.set(p, Math.floor(sum / all.length));
        return label + `tout le monde a maintenant ${Math.floor(sum / all.length)} pièces !`;
      }
      case "voleur": {
        const victims = others.filter((o) => this.hands.get(o)!.length);
        const o = victims[Math.floor(this.host.random() * victims.length)];
        if (!o || this.hands.get(id)!.length >= GLOBE_HAND_MAX) return label + "rien à voler…";
        const hand = this.hands.get(o)!;
        const card = hand.splice(Math.floor(this.host.random() * hand.length), 1)[0]!;
        this.giveCard(id, card);
        return label + `vole une carte ${cardLabel(card)} à ${this.name(o)} !`;
      }
      case "tornade": {
        const o = pick();
        if (!o) return label + "le vent souffle, mais rien ne bouge.";
        const a = this.positions.get(id)!;
        this.positions.set(id, this.positions.get(o)!);
        this.positions.set(o, a);
        this.turn!.path = [this.positions.get(id)!];
        this.turn!.moveId = ++this.moveId;
        return label + `échange sa place avec ${this.name(o)} !`;
      }
      case "ovni": {
        const space = Math.floor(this.host.random() * GLOBE_SIZE);
        this.positions.set(id, space);
        this.turn!.path = [space];
        this.turn!.moveId = ++this.moveId;
        return label + "un OVNI l'emporte à l'autre bout du monde !";
      }
      case "billet": {
        const card = this.randomCard();
        return label + (this.giveCard(id, card) ? `reçoit une carte ${cardLabel(card)}.` : "main pleine, dommage !");
      }
      case "malle": {
        const n = -this.addCoins(id, -5);
        return label + `perd ${n} pièce${n > 1 ? "s" : ""}.`;
      }
    }
  }

  private show(text: string): void {
    const turn = this.turn!;
    turn.text = text;
    turn.choice = null;
    turn.spin = undefined;
    turn.reveal = undefined;
    turn.endsAt = null;
    this.pending = null;
    this.setStage("globe", GLOBE_TIMINGS.result);
    this.goTo(GLOBE_TIMINGS.result, () => this.nextTurn());
  }

  // ───────────── Mini-jeux ─────────────

  protected onMiniGameDone(ranking: string[][]): void {
    const changes: RoundResult["changes"] = [];
    if (this.miniGameKind === "ordre") {
      // Pièces selon la place (les ex æquo touchent la même somme) ; l'ordre suit le classement.
      let place = 0;
      for (const group of ranking) {
        const n = ORDER_COINS[Math.min(place, ORDER_COINS.length - 1)]!;
        for (const id of group) changes.push({ playerId: id, points: this.addCoins(id, n) });
        place += group.length;
      }
      const ranked = ranking.flat();
      this.order = [...ranked, ...this.order.filter((id) => !ranked.includes(id))];
    } else if (this.miniGameKind === "unvstous" && this.soloId) {
      const places = new Map<string, number>();
      ranking.forEach((g, i) => g.forEach((id) => places.set(id, i)));
      const team = [...places.keys()].filter((id) => id !== this.soloId);
      const mean = team.reduce((s, id) => s + places.get(id)!, 0) / Math.max(1, team.length);
      const solo = places.get(this.soloId) ?? 99;
      if (solo < mean) changes.push({ playerId: this.soloId, points: this.addCoins(this.soloId, 15) });
      else if (solo > mean) for (const id of team) changes.push({ playerId: id, points: this.addCoins(id, 5) });
    }
    const kind = this.miniGameKind;
    this.miniGameKind = null;
    this.soloId = null;
    this.showResults(ranking, changes, () => {
      if (kind === "ordre") {
        this.turnIndex = -1;
        this.nextTurn();
      } else this.nextTurn();
    });
  }

  private end(): void {
    const players = this.players();
    const score = (id: string) => this.photos.get(id)!.length * 10_000 + (this.coins.get(id) ?? 0);
    const best = Math.max(...players.map(score));
    this.turn = null;
    this.pending = null;
    this.podium(players.filter((id) => score(id) === best));
  }
}

export const voyageMode: GameModeModule = {
  id: "voyage",
  create: (host) => new GlobeGame(host),
};
