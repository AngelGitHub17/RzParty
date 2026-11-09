import {
  ERRORS,
  HIDDEN_BODY,
  PAIRES_MINIGAME_EVERY,
  PAIR_COLORS,
  coloredAvatar,
  type Avatar,
  type GameSnapshot,
  type PairCard,
  type RoundResult,
  type Standing,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const PAIRES_TIMINGS = {
  intro: 2500,
  /** Temps pour retourner une carte. */
  flip: 20_000,
  botThink: 1200,
  /** Les deux cartes restent visibles. */
  show: 1800,
  /** Changement de joueur (et de place de deux personnages). */
  change: 1500,
};

interface Card {
  avatar: Avatar;
  color: number;
  found: string | null;
  moved: boolean;
}

/**
 * Mode « Paires cachées » : 24 personnages (12 couleurs de tenue, 2 de chaque) se cachent sous une
 * tenue sombre. À son tour, on en retourne deux : même couleur = une paire (+1 point), et on rejoue.
 * Une erreur coûte un cœur ; sans cœur, la main passe. Entre deux joueurs, deux personnages
 * échangent parfois leur place. Tous les 3 tours, un mini-jeu fait gagner un cœur en plus.
 * Fin quand toutes les paires sont trouvées ou après le dernier tour : le plus de paires gagne.
 */
export class PairesGame extends BaseGame {
  protected readonly mode = "paires" as const;
  private cards: Card[] = [];
  private flipped: number[] = [];
  private scores = new Map<string, number>();
  private bonus = new Map<string, number>();
  private order: string[];
  private turnIndex = 0;
  private hearts = 1;
  private tour = 1;
  private phase: "flip" | "show" = "flip";
  private last: "paire" | "rate" | null = null;
  private endsAt: number | null = null;
  /** Ce que chaque bot a vu (place → couleur), qu'il oublie un peu. */
  private memory = new Map<string, Map<number, number>>();

  constructor(host: GameHost) {
    super(host);
    for (const p of host.room.players) {
      this.scores.set(p.id, 0);
      this.bonus.set(p.id, 0);
      this.memory.set(p.id, new Map());
    }
    this.order = [...this.scores.keys()];
    const colors = PAIR_COLORS.flatMap((c) => [c, c]).sort(() => host.random() - 0.5);
    this.cards = colors.map((color) => ({ avatar: coloredAvatar(host.random, color), color, found: null, moved: false }));
  }

  private tours(): number {
    return this.host.room.settings.paires.tours;
  }

  start(): void {
    this.setStage("paires", PAIRES_TIMINGS.intro);
    this.goTo(PAIRES_TIMINGS.intro, () => this.beginTurn());
  }

  protected standings(): Standing[] {
    return [...this.scores].map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      paires: {
        cards: this.cards.map(
          (c, i): PairCard => {
            const visible = c.found !== null || this.flipped.includes(i);
            return { avatar: visible ? c.avatar : { ...c.avatar, body: HIDDEN_BODY }, color: visible ? c.color : null, found: c.found, moved: c.moved };
          },
        ),
        flipped: [...this.flipped],
        turn: this.turn(),
        hearts: this.hearts,
        bonus: Object.fromEntries(this.bonus),
        tour: this.tour,
        tours: this.tours(),
        scores: Object.fromEntries(this.scores),
        phase: this.phase,
        last: this.last,
        endsAt: this.endsAt,
      },
    };
  }

  playerRemoved(playerId: string): void {
    const wasTurn = this.turn() === playerId;
    const index = this.order.indexOf(playerId);
    this.order = this.order.filter((id) => id !== playerId);
    if (index >= 0 && index < this.turnIndex) this.turnIndex--;
    if (wasTurn) {
      this.flipped = [];
      this.turnIndex--;
      this.endTurn();
    } else this.host.changed();
  }

  private turn(): string | null {
    return this.stage === "paires" ? (this.order[this.turnIndex] ?? null) : null;
  }

  private remaining(): number {
    return this.cards.filter((c) => c.found === null).length / 2;
  }

  private beginTurn(): void {
    if (this.disposed) return;
    if (!this.remaining() || this.order.length < 1) return this.finish();
    this.module = null;
    this.participants = [];
    const id = this.turn();
    if (!id) return this.finish();
    this.hearts = 1 + (this.bonus.get(id) ?? 0);
    this.bonus.set(id, 0);
    this.last = null;
    this.waitFlip();
  }

  private waitFlip(): void {
    const id = this.turn()!;
    this.phase = "flip";
    const wait = this.isBotOrAway(id) ? PAIRES_TIMINGS.botThink : PAIRES_TIMINGS.flip;
    this.endsAt = this.host.now() + wait;
    this.setStage("paires", null);
    this.goTo(wait, () => this.flip(id, this.botChoice(id)));
  }

  private flip(playerId: string, index: number): void {
    if (this.turn() !== playerId || this.phase !== "flip") return;
    this.flipped.push(index);
    for (const [, mem] of this.memory) mem.set(index, this.cards[index]!.color);
    if (this.flipped.length < 2) return this.waitFlip();
    const [a, b] = this.flipped as [number, number];
    const pair = this.cards[a]!.color === this.cards[b]!.color;
    this.phase = "show";
    this.last = pair ? "paire" : "rate";
    if (pair) {
      this.cards[a]!.found = playerId;
      this.cards[b]!.found = playerId;
      this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1);
    } else this.hearts--;
    this.endsAt = null;
    this.setStage("paires", PAIRES_TIMINGS.show);
    this.goTo(PAIRES_TIMINGS.show, () => {
      this.flipped = [];
      if (!this.remaining()) return this.finish();
      if (pair || this.hearts > 0) {
        this.last = null;
        return this.waitFlip();
      }
      this.endTurn();
    });
  }

  private endTurn(): void {
    if (this.disposed) return;
    for (const c of this.cards) c.moved = false;
    this.turnIndex++;
    if (this.turnIndex >= this.order.length) {
      this.turnIndex = 0;
      if (this.tour >= this.tours()) return this.finish();
      this.tour++;
      // Tous les 3 tours : mini-jeu, le gagnant gagne un cœur de plus.
      if ((this.tour - 1) % PAIRES_MINIGAME_EVERY === 0 && this.startMiniGame(this.order, "paires")) return;
    }
    this.shuffleSome();
    this.phase = "flip";
    this.endsAt = null;
    this.setStage("paires", PAIRES_TIMINGS.change);
    this.goTo(PAIRES_TIMINGS.change, () => this.beginTurn());
  }

  /** Deux personnages encore cachés échangent leur place (souvent). */
  private shuffleSome(): void {
    const hidden = this.cards.map((c, i) => (c.found === null ? i : -1)).filter((i) => i >= 0);
    if (hidden.length < 4 || this.host.random() < 0.35) return;
    const a = hidden[Math.floor(this.host.random() * hidden.length)]!;
    let b = a;
    while (b === a) b = hidden[Math.floor(this.host.random() * hidden.length)]!;
    [this.cards[a], this.cards[b]] = [this.cards[b]!, this.cards[a]!];
    this.cards[a]!.moved = true;
    this.cards[b]!.moved = true;
    // Qui a vu bouger les personnages s'en souvient… ou pas.
    for (const [id, mem] of this.memory) {
      const ca = mem.get(a);
      const cb = mem.get(b);
      mem.delete(a);
      mem.delete(b);
      const p = this.host.room.findPlayer(id);
      const careful = p?.botPersonality === "lent-precis" ? 0.9 : 0.6;
      if (this.host.random() < careful) {
        if (cb !== undefined) mem.set(a, cb);
        if (ca !== undefined) mem.set(b, ca);
      }
    }
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const winners = (ranking[0] ?? []).filter((id) => this.bonus.has(id));
    for (const id of winners) this.bonus.set(id, (this.bonus.get(id) ?? 0) + 1);
    const changes: RoundResult["changes"] = winners.map((id) => ({ playerId: id, points: 1 }));
    this.showResults(ranking, changes, () => {
      this.shuffleSome();
      this.beginTurn();
    });
  }

  private finish(): void {
    this.flipped = [];
    const players = this.order.filter((id) => this.host.room.findPlayer(id));
    const best = Math.max(0, ...players.map((id) => this.scores.get(id) ?? 0));
    this.podium(players.filter((id) => (this.scores.get(id) ?? 0) === best));
  }

  // ───────────── Bots ─────────────

  private botChoice(id: string): number {
    const free = this.cards.map((c, i) => (c.found === null && !this.flipped.includes(i) ? i : -1)).filter((i) => i >= 0);
    const p = this.host.room.findPlayer(id);
    const mem = this.memory.get(id) ?? new Map<number, number>();
    // Un humain absent joue au hasard ; un bot oublie selon son niveau.
    const recall = !p?.isBot ? 0 : p.botPersonality === "glitch" ? 0.35 : { facile: 0.45, moyen: 0.7, difficile: 0.92 }[this.host.room.settings.botDifficulty];
    const known = (i: number) => (this.host.random() < recall ? mem.get(i) : undefined);
    if (this.flipped.length === 1) {
      const color = this.cards[this.flipped[0]!]!.color;
      const match = free.find((i) => known(i) === color);
      if (match !== undefined) return match;
    } else {
      // Une paire déjà repérée ?
      for (const i of free) {
        const ci = known(i);
        if (ci === undefined) continue;
        const j = free.find((k) => k !== i && mem.get(k) === ci);
        if (j !== undefined) return i;
      }
    }
    const unknown = free.filter((i) => !mem.has(i));
    const pool = unknown.length ? unknown : free;
    return pool[Math.floor(this.host.random() * pool.length)]!;
  }

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; card?: unknown } | null;
    if (this.turn() !== playerId || this.phase !== "flip") throw new RoomError(ERRORS.notYourTurn);
    if (action?.type !== "flip" || typeof action.card !== "number" || !Number.isInteger(action.card)) throw new RoomError(ERRORS.badRequest);
    const c = this.cards[action.card];
    if (!c || c.found !== null || this.flipped.includes(action.card)) throw new RoomError("Choisis un personnage encore caché.");
    this.flip(playerId, action.card);
  }
}

export const pairesMode: GameModeModule = { id: "paires", create: (host) => new PairesGame(host) };
