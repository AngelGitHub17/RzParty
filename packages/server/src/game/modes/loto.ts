import { ERRORS, LOTO_FREE, LOTO_LINES, LOTO_POOL, createRng, hasLine, randomAvatar, type Avatar, type GameSnapshot, type LotoBall, type RoundResult, type Standing } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const LOTO_TIMINGS = {
  intro: 2500,
  /** Intervalle entre deux boules. */
  draw: 3200,
  /** Choix de la case après un mini-jeu gagné. */
  pickTimeout: 20_000,
  botPick: 1500,
};

/** Une boule « Mini-jeu » sort environ une fois sur 7. */
const MINIGAME_CHANCE = 0.14;

/**
 * Mode « Loto des copains » : chacun reçoit un carton de 24 personnages (+ la case centrale offerte).
 * Les boules tirées cochent automatiquement les cartons. Une boule « Mini-jeu » lance un mini-jeu :
 * le gagnant coche la case de son choix. La première ligne complète gagne.
 */
export class LotoGame extends BaseGame {
  protected readonly mode = "loto" as const;
  private pool: Avatar[];
  private cards = new Map<string, number[]>();
  private marked = new Map<string, boolean[]>();
  private drawn: number[] = [];
  private ball: LotoBall | null = null;
  private ballId = 0;
  private lotoPhase: "draw" | "pick" = "draw";
  private pickers: string[] = [];
  private endsAt: number | null = null;
  private sinceMiniGame = 0;

  constructor(host: GameHost) {
    super(host);
    const rng = createRng(Math.floor(host.random() * 2 ** 31));
    this.pool = Array.from({ length: LOTO_POOL }, () => randomAvatar(rng));
    for (const p of host.room.players) {
      const picks = Array.from({ length: LOTO_POOL }, (_, i) => i).sort(() => host.random() - 0.5).slice(0, 24);
      const card = [...picks.slice(0, LOTO_FREE), -1, ...picks.slice(LOTO_FREE)];
      this.cards.set(p.id, card);
      this.marked.set(p.id, card.map((n) => n === -1));
    }
  }

  start(): void {
    this.setStage("loto", LOTO_TIMINGS.intro);
    this.goTo(LOTO_TIMINGS.intro, () => this.draw());
  }

  protected standings(): Standing[] {
    return [...this.marked].map(([playerId, m]) => ({ playerId, lives: 0, score: m.filter(Boolean).length - 1, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      loto: {
        pool: this.pool,
        cards: Object.fromEntries(this.cards),
        marked: Object.fromEntries([...this.marked].map(([id, m]) => [id, [...m]])),
        drawn: [...this.drawn],
        ball: this.ball,
        ballId: this.ballId,
        phase: this.lotoPhase,
        pickers: [...this.pickers],
        endsAt: this.endsAt,
      },
    };
  }

  playerRemoved(playerId: string): void {
    this.pickers = this.pickers.filter((id) => id !== playerId);
    this.readyIds.delete(playerId);
    this.host.changed();
  }

  private players(): string[] {
    return [...this.cards.keys()].filter((id) => this.host.room.findPlayer(id));
  }

  private draw(): void {
    if (this.disposed) return;
    this.module = null;
    this.participants = [];
    this.lotoPhase = "draw";
    this.pickers = [];
    const remaining = Array.from({ length: LOTO_POOL }, (_, i) => i).filter((i) => !this.drawn.includes(i));
    const miniGame = remaining.length === 0 || (this.sinceMiniGame >= 3 && this.host.random() < MINIGAME_CHANCE);
    this.ballId++;
    if (miniGame) {
      this.sinceMiniGame = 0;
      this.ball = { kind: "minijeu" };
      this.endsAt = null;
      this.setStage("loto", LOTO_TIMINGS.draw);
      this.goTo(LOTO_TIMINGS.draw, () => {
        if (!this.startMiniGame(this.players(), "loto")) this.draw();
      });
      return;
    }
    this.sinceMiniGame++;
    const index = remaining[Math.floor(this.host.random() * remaining.length)]!;
    this.drawn.push(index);
    this.ball = { kind: "perso", index };
    for (const [id, card] of this.cards) {
      const pos = card.indexOf(index);
      if (pos >= 0) this.marked.get(id)![pos] = true;
    }
    this.endsAt = null;
    this.setStage("loto", LOTO_TIMINGS.draw);
    if (this.checkWin()) return;
    this.goTo(LOTO_TIMINGS.draw, () => this.draw());
  }

  /** Une ligne complète : la partie s'arrête (plusieurs gagnants possibles). */
  private checkWin(): boolean {
    const winners = this.players().filter((id) => hasLine(this.marked.get(id)!));
    if (!winners.length) return false;
    this.goTo(2500, () => this.podium(winners));
    return true;
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const winners = (ranking[0] ?? []).filter((id) => this.cards.has(id));
    const changes: RoundResult["changes"] = winners.map((id) => ({ playerId: id, points: 1 }));
    this.showResults(ranking, changes, () => this.askPick(winners));
  }

  private askPick(winners: string[]): void {
    this.module = null;
    this.participants = [];
    this.lotoPhase = "pick";
    this.pickers = [...winners];
    const allBots = winners.every((id) => this.isBotOrAway(id));
    const wait = allBots ? LOTO_TIMINGS.botPick : LOTO_TIMINGS.pickTimeout;
    this.endsAt = this.host.now() + wait;
    this.setStage("loto", null);
    // Les bots (et les absents) choisissent tout de suite la meilleure case.
    for (const id of winners) if (this.isBotOrAway(id)) this.goToLater(id);
    this.goTo(wait, () => {
      for (const id of [...this.pickers]) this.mark(id, this.bestCell(id));
      this.afterPick();
    });
  }

  private goToLater(id: string): void {
    setTimeout(() => {
      if (this.disposed || !this.pickers.includes(id)) return;
      this.mark(id, this.bestCell(id));
      if (!this.pickers.length) this.afterPick();
      else this.host.changed();
    }, LOTO_TIMINGS.botPick);
  }

  /** Case qui rapproche le plus d'une ligne complète. */
  private bestCell(id: string): number {
    const m = this.marked.get(id)!;
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < 25; i++) {
      if (m[i]) continue;
      const score = Math.max(...LOTO_LINES.filter((l) => l.includes(i)).map((l) => l.filter((c) => m[c]).length));
      if (score > bestScore) (best = i), (bestScore = score);
    }
    return best;
  }

  private mark(id: string, cell: number): void {
    const m = this.marked.get(id);
    if (!m || cell < 0 || cell > 24 || m[cell]) return;
    m[cell] = true;
    this.pickers = this.pickers.filter((p) => p !== id);
  }

  private afterPick(): void {
    if (this.lotoPhase !== "pick") return;
    this.lotoPhase = "draw";
    this.endsAt = null;
    this.setStage("loto", null);
    if (this.checkWin()) return;
    this.goTo(1200, () => this.draw());
  }

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; cell?: unknown } | null;
    if (this.stage !== "loto" || this.lotoPhase !== "pick" || !this.pickers.includes(playerId)) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type !== "mark" || typeof action.cell !== "number" || this.marked.get(playerId)![action.cell]) throw new RoomError(ERRORS.badRequest);
    this.mark(playerId, action.cell);
    if (!this.pickers.length) this.afterPick();
    else this.host.changed();
  }
}

export const lotoMode: GameModeModule = { id: "loto", create: (host) => new LotoGame(host) };
