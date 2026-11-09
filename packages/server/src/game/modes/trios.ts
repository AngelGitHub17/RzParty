import {
  ERRORS,
  TRIO_COLORS,
  TRIO_JOKER,
  coloredAvatar,
  HIDDEN_BODY,
  trioPoints,
  trioRowColor,
  trioRows,
  type GameSnapshot,
  type RoundResult,
  type Standing,
  type TrioChar,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const TRIOS_TIMINGS = {
  intro: 2500,
  /** Temps pour prendre un personnage. */
  pick: 25_000,
  botThink: 1800,
  /** Pause après chaque échange (animation). */
  afterPick: 1400,
  /** Affichage des trios marqués. */
  score: 4000,
};

/** Un personnage du jeu, avec sa vraie couleur (même si elle est encore cachée aux joueurs). */
interface Char {
  avatar: TrioChar["avatar"];
  color: number;
  hidden: boolean;
}

/**
 * Mode « Trios » : chacun a 6 personnages (2 rangées de 3). À chaque tour, un mini-jeu décide
 * de l'ordre ; dans cet ordre, chacun prend un personnage au centre et le met à la place d'un des siens
 * (ou passe). Certains cachent leur couleur jusqu'à ce qu'on les prenne, l'arc-en-ciel va avec tout.
 * À la fin du tour, chaque rangée de 3 de la même couleur rapporte 3 points (10 pour les deux d'un coup),
 * puis laisse sa place à 3 nouveaux personnages. Le plus de points à la fin gagne.
 */
export class TriosGame extends BaseGame {
  protected readonly mode = "trios" as const;
  private platforms = new Map<string, Char[]>();
  private center: (Char | null)[] = [];
  private scores = new Map<string, number>();
  private order: string[];
  private turnIndex = -1;
  /** Pause d'animation après un échange : plus personne ne peut jouer. */
  private pausing = false;
  private triosRound = 0;
  private phase: "pick" | "score" = "pick";
  private endsAt: number | null = null;
  private lastSwap: { playerId: string; slot: number; center: number } | null = null;
  private scored: { playerId: string; rows: number[]; points: number }[] = [];

  constructor(host: GameHost) {
    super(host);
    for (const p of host.room.players) {
      this.scores.set(p.id, 0);
      // Départ sans trio tout fait.
      let chars: Char[];
      do chars = Array.from({ length: 6 }, () => this.newChar(false, false));
      while (trioRows(chars.map((c) => c.color)).length);
      this.platforms.set(p.id, chars);
    }
    this.order = [...this.scores.keys()];
  }

  private rounds(): number {
    return this.host.room.settings.trios.rounds;
  }

  private newChar(allowHidden = true, allowJoker = true): Char {
    const r = this.host.random();
    const joker = allowJoker && r < 0.07;
    const color = joker ? TRIO_JOKER : Math.floor(this.host.random() * TRIO_COLORS.length);
    const hidden = allowHidden && !joker && this.host.random() < 0.3;
    // Le joker porte une tenue blanche « arc-en-ciel » (dessinée par l'interface).
    const body = joker ? 11 : TRIO_COLORS[color]!;
    return { avatar: coloredAvatar(this.host.random, body), color, hidden };
  }

  private publicChar(c: Char): TrioChar {
    return c.hidden ? { avatar: { ...c.avatar, body: HIDDEN_BODY }, color: null } : { avatar: c.avatar, color: c.color };
  }

  start(): void {
    this.setStage("trios", TRIOS_TIMINGS.intro);
    this.goTo(TRIOS_TIMINGS.intro, () => this.nextRound());
  }

  protected standings(): Standing[] {
    return [...this.scores].map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      trios: {
        round: this.triosRound,
        rounds: this.rounds(),
        phase: this.phase,
        platforms: Object.fromEntries([...this.platforms].map(([id, chars]) => [id, chars.map((c) => this.publicChar(c))])),
        center: this.center.map((c) => (c ? this.publicChar(c) : null)),
        order: [...this.order],
        turn: this.turn(),
        endsAt: this.endsAt,
        scores: Object.fromEntries(this.scores),
        lastSwap: this.lastSwap,
        scored: this.scored,
      },
    };
  }

  playerRemoved(playerId: string): void {
    const wasTurn = this.turn() === playerId;
    const index = this.order.indexOf(playerId);
    this.order = this.order.filter((id) => id !== playerId);
    if (index >= 0 && index < this.turnIndex) this.turnIndex--;
    if (wasTurn) {
      this.turnIndex--;
      this.nextTurn();
    } else this.host.changed();
  }

  private players(): string[] {
    return this.order.filter((id) => this.host.room.findPlayer(id));
  }

  private turn(): string | null {
    return this.stage === "trios" && this.phase === "pick" && !this.pausing ? (this.order[this.turnIndex] ?? null) : null;
  }

  // ───────────── Déroulé ─────────────

  private nextRound(): void {
    if (this.disposed) return;
    if (this.triosRound >= this.rounds() || this.players().length < 2) return this.finish();
    this.triosRound++;
    this.turnIndex = -1;
    this.lastSwap = null;
    this.scored = [];
    // Le centre : un personnage par joueur.
    this.center = this.players().map(() => this.newChar());
    if (!this.startMiniGame(this.players(), "ordre")) this.beginPicks(this.players());
  }

  protected onMiniGameDone(ranking: string[][]): void {
    // Égalité : départagée au hasard.
    const order = ranking.flatMap((group) => [...group].sort(() => this.host.random() - 0.5)).filter((id) => this.scores.has(id));
    for (const id of this.players()) if (!order.includes(id)) order.push(id);
    this.showResults(ranking, [], () => this.beginPicks(order));
  }

  private beginPicks(order: string[]): void {
    this.module = null;
    this.participants = [];
    this.order = [...order, ...this.order.filter((id) => !order.includes(id))];
    this.phase = "pick";
    this.turnIndex = -1;
    this.nextTurn();
  }

  private nextTurn(): void {
    if (this.disposed) return;
    this.pausing = false;
    this.turnIndex++;
    while (this.turnIndex < this.order.length && !this.host.room.findPlayer(this.order[this.turnIndex]!)) this.turnIndex++;
    const id = this.order[this.turnIndex];
    if (!id || this.center.every((c) => c === null)) return this.scoreRound();
    const bot = this.isBotOrAway(id);
    const wait = bot ? TRIOS_TIMINGS.botThink : TRIOS_TIMINGS.pick;
    this.endsAt = this.host.now() + wait;
    this.setStage("trios", null);
    this.goTo(wait, () => {
      const best = this.bestMove(id);
      this.swap(id, best?.center ?? null, best?.slot ?? 0);
    });
  }

  /** Échange : le personnage du centre prend la place `slot` ; l'ancien s'en va. */
  private swap(playerId: string, center: number | null, slot: number): void {
    if (this.turn() !== playerId) return;
    const chars = this.platforms.get(playerId)!;
    if (center !== null) {
      const c = this.center[center]!;
      c.hidden = false;
      chars[slot] = c;
      this.center[center] = null;
      this.lastSwap = { playerId, slot, center };
    } else this.lastSwap = null;
    this.endsAt = null;
    this.pausing = true;
    this.setStage("trios", null);
    this.goTo(TRIOS_TIMINGS.afterPick, () => this.nextTurn());
  }

  private scoreRound(): void {
    this.phase = "score";
    this.endsAt = null;
    this.scored = [];
    const changes: RoundResult["changes"] = [];
    for (const id of this.players()) {
      const chars = this.platforms.get(id)!;
      const rows = trioRows(chars.map((c) => c.color));
      if (!rows.length) continue;
      const points = trioPoints(rows.length);
      this.scores.set(id, (this.scores.get(id) ?? 0) + points);
      this.scored.push({ playerId: id, rows, points });
      changes.push({ playerId: id, points });
    }
    this.setStage("trios", TRIOS_TIMINGS.score);
    this.goTo(TRIOS_TIMINGS.score, () => {
      // Les rangées faites laissent la place à 3 nouveaux personnages.
      for (const s of this.scored) {
        const chars = this.platforms.get(s.playerId);
        if (!chars) continue;
        for (const r of s.rows) for (let i = 0; i < 3; i++) chars[r * 3 + i] = this.newChar(false, true);
      }
      this.nextRound();
    });
  }

  private finish(): void {
    const players = this.players();
    const best = Math.max(...players.map((id) => this.scores.get(id) ?? 0));
    this.podium(players.filter((id) => (this.scores.get(id) ?? 0) === best));
  }

  // ───────────── Bots ─────────────

  /** Valeur d'un plateau : trios faits, puis rangées presque faites. */
  private value(colors: number[]): number {
    let v = trioPoints(trioRows(colors).length) * 100;
    for (const r of [0, 1]) {
      const row = colors.slice(r * 3, r * 3 + 3);
      if (trioRowColor(row) !== null) continue;
      const counts = new Map<number, number>();
      const jokers = row.filter((c) => c === TRIO_JOKER).length;
      for (const c of row) if (c !== TRIO_JOKER) counts.set(c, (counts.get(c) ?? 0) + 1);
      const most = Math.max(0, ...counts.values()) + jokers;
      if (most >= 2) v += 20;
    }
    return v;
  }

  private bestMove(playerId: string): { center: number; slot: number } | null {
    const chars = this.platforms.get(playerId);
    if (!chars) return null;
    const colors = chars.map((c) => c.color);
    const base = this.value(colors);
    const p = this.host.room.findPlayer(playerId);
    const sloppy = p?.isBot && (p.botPersonality === "glitch" || this.host.room.settings.botDifficulty === "facile") && this.host.random() < 0.3;
    let best: { center: number; slot: number; v: number } | null = null;
    this.center.forEach((c, ci) => {
      if (!c) return;
      for (let slot = 0; slot < 6; slot++) {
        // Couleur cachée : on la suppose quelconque (valeur moyenne).
        const tries = c.hidden ? TRIO_COLORS.map((_, i) => i) : [c.color];
        let v = 0;
        for (const color of tries) {
          const next = [...colors];
          next[slot] = color;
          v += this.value(next);
        }
        v = v / tries.length + (sloppy ? this.host.random() * 60 : this.host.random());
        if (!best || v > best.v) best = { center: ci, slot, v };
      }
    });
    const found = best as { center: number; slot: number; v: number } | null;
    if (!found) return null;
    // Rien de mieux : on prend quand même (sauf si ça casse tout), pour faire tourner le centre.
    return found.v + 5 < base ? null : { center: found.center, slot: found.slot };
  }

  // ───────────── Actions ─────────────

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; center?: unknown; slot?: unknown } | null;
    if (this.turn() !== playerId) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type !== "trio") throw new RoomError(ERRORS.badRequest);
    if (action.center === null) return this.swap(playerId, null, 0);
    const { center, slot } = action;
    if (typeof center !== "number" || typeof slot !== "number" || !Number.isInteger(center) || !Number.isInteger(slot) || slot < 0 || slot > 5 || !this.center[center]) {
      throw new RoomError(ERRORS.badRequest);
    }
    this.swap(playerId, center, slot);
  }
}

export const triosMode: GameModeModule = { id: "trios", create: (host) => new TriosGame(host) };
