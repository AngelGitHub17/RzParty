import {
  ERRORS,
  LOTO_CELLS,
  LOTO_GRIDS,
  LOTO_LINES,
  LOTO_MINIGAME_BALLS,
  LOTO_POOL,
  createRng,
  hasLine,
  randomAvatar,
  type Avatar,
  type GameSnapshot,
  type LotoBall,
  type RoundResult,
  type Standing,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const LOTO_TIMINGS = {
  intro: 2500,
  /** Choix des grilles. */
  choose: 25_000,
  /** Temps pour cocher le personnage tiré, avant la boule suivante. */
  draw: 5500,
  /** Tout le monde a coché : on enchaîne plus vite. */
  drawFast: 1600,
  /** Boule Mini-jeu affichée avant de lancer le mini-jeu. */
  minigameBall: 3200,
  /** Choix de la case après un mini-jeu gagné. */
  pickTimeout: 20_000,
  botPick: 1500,
};

/**
 * Mode « Bingo des copains » : chacun choisit une grille de 16 personnages parmi 6.
 * La machine contient les 24 personnages et 10 boules « Mini-jeu ». Quand un personnage sort,
 * ceux qui l'ont doivent le toucher sur leur grille avant la boule suivante, sinon tant pis.
 * Une boule « Mini-jeu » lance un mini-jeu : le gagnant coche la case de son choix.
 * La première ligne de 4 (rangée, colonne ou diagonale) gagne.
 */
export class LotoGame extends BaseGame {
  protected readonly mode = "loto" as const;
  private pool: Avatar[] = [];
  private grids: number[][] = [];
  private choice = new Map<string, number | null>();
  private marked = new Map<string, boolean[]>();
  private bag: LotoBall[] = [];
  private drawn: number[] = [];
  private ball: LotoBall | null = null;
  private ballId = 0;
  private markable: number | null = null;
  private lotoPhase: "choose" | "draw" | "pick" = "choose";
  private pickers: string[] = [];
  private endsAt: number | null = null;

  constructor(host: GameHost) {
    super(host);
    const rng = createRng(Math.floor(host.random() * 2 ** 31));
    // 24 personnages bien différents (couleur et forme).
    const seen = new Set<string>();
    while (this.pool.length < LOTO_POOL) {
      const a = randomAvatar(rng);
      const key = `${a.body}-${a.shape}`;
      if (seen.has(key) && seen.size < 40) continue;
      seen.add(key);
      this.pool.push(a);
    }
    const count = Math.max(LOTO_GRIDS, host.room.players.length);
    for (let g = 0; g < count; g++) {
      this.grids.push(Array.from({ length: LOTO_POOL }, (_, i) => i).sort(() => host.random() - 0.5).slice(0, LOTO_CELLS));
    }
    for (const p of host.room.players) {
      this.choice.set(p.id, null);
      this.marked.set(p.id, Array(LOTO_CELLS).fill(false));
    }
    this.bag = [
      ...Array.from({ length: LOTO_POOL }, (_, index) => ({ kind: "perso", index }) as LotoBall),
      ...Array.from({ length: LOTO_MINIGAME_BALLS }, () => ({ kind: "minijeu" }) as LotoBall),
    ].sort(() => host.random() - 0.5);
    // Jamais de boule Mini-jeu en tout premier.
    const firstFace = this.bag.findIndex((b) => b.kind === "perso");
    [this.bag[0], this.bag[firstFace]] = [this.bag[firstFace]!, this.bag[0]!];
  }

  start(): void {
    this.lotoPhase = "choose";
    const allBots = this.players().every((id) => this.isBotOrAway(id));
    const wait = allBots ? 2500 : LOTO_TIMINGS.choose;
    this.endsAt = this.host.now() + wait;
    this.setStage("loto", null);
    // Les bots choisissent leur grille l'un après l'autre.
    this.players()
      .filter((id) => this.isBotOrAway(id))
      .forEach((id, i) => this.later(700 + i * 500, () => this.chooseGrid(id, this.freeGrids()[Math.floor(this.host.random() * this.freeGrids().length)]!)));
    this.goTo(wait, () => this.endChoose());
  }

  protected standings(): Standing[] {
    return [...this.marked].map(([playerId, m]) => ({ playerId, lives: 0, score: m.filter(Boolean).length, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      loto: {
        pool: this.pool,
        grids: this.grids,
        choice: Object.fromEntries(this.choice),
        marked: Object.fromEntries([...this.marked].map(([id, m]) => [id, [...m]])),
        drawn: [...this.drawn],
        ball: this.ball,
        ballId: this.ballId,
        markable: this.markable,
        left: { faces: this.bag.filter((b) => b.kind === "perso").length, minigames: this.bag.filter((b) => b.kind === "minijeu").length },
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
    return [...this.marked.keys()].filter((id) => this.host.room.findPlayer(id));
  }

  private grid(id: string): number[] | null {
    const g = this.choice.get(id);
    return g === null || g === undefined ? null : this.grids[g]!;
  }

  // ───────────── Choix des grilles ─────────────

  private freeGrids(): number[] {
    const taken = new Set([...this.choice.values()]);
    return this.grids.map((_, i) => i).filter((i) => !taken.has(i));
  }

  private chooseGrid(id: string, grid: number): void {
    if (this.lotoPhase !== "choose" || this.choice.get(id) !== null || !this.freeGrids().includes(grid)) return;
    this.choice.set(id, grid);
    if (this.players().every((p) => this.choice.get(p) !== null)) this.goTo(1500, () => this.endChoose());
    this.host.changed();
  }

  private endChoose(): void {
    if (this.lotoPhase !== "choose") return;
    for (const id of this.players()) if (this.choice.get(id) === null) this.choice.set(id, this.freeGrids()[0]!);
    this.lotoPhase = "draw";
    this.endsAt = null;
    this.setStage("loto", null);
    this.goTo(LOTO_TIMINGS.intro, () => this.draw());
  }

  // ───────────── Tirage ─────────────

  private draw(): void {
    if (this.disposed) return;
    this.module = null;
    this.participants = [];
    this.lotoPhase = "draw";
    this.pickers = [];
    const ball = this.bag.shift();
    if (!ball) {
      // Machine vide sans ligne : le plus de cases cochées gagne.
      const best = Math.max(...this.players().map((id) => this.marked.get(id)!.filter(Boolean).length));
      return this.podium(this.players().filter((id) => this.marked.get(id)!.filter(Boolean).length === best));
    }
    this.ballId++;
    this.ball = ball;
    if (ball.kind === "minijeu") {
      this.endsAt = null;
      this.setStage("loto", LOTO_TIMINGS.minigameBall);
      this.goTo(LOTO_TIMINGS.minigameBall, () => {
        if (!this.startMiniGame(this.players(), "loto")) this.draw();
      });
      return;
    }
    this.drawn.push(ball.index);
    this.markable = ball.index;
    this.endsAt = this.host.now() + LOTO_TIMINGS.draw;
    this.setStage("loto", LOTO_TIMINGS.draw);
    const ballId = this.ballId;
    for (const id of this.holders(ball.index)) {
      if (!this.isBotOrAway(id)) continue;
      const p = this.host.room.findPlayer(id);
      // Un absent coche à coup sûr ; un bot peut rater (surtout s'il est distrait).
      const missChance = !p || !p.isBot ? 0 : p.botPersonality === "glitch" ? 0.2 : this.host.room.settings.botDifficulty === "facile" ? 0.12 : this.host.room.settings.botDifficulty === "moyen" ? 0.05 : 0.01;
      if (this.host.random() < missChance) continue;
      const delay = p?.botPersonality === "agressif" ? 600 : p?.botPersonality === "lent-precis" ? 2600 : 900 + this.host.random() * 1800;
      this.later(delay, () => {
        if (this.ballId === ballId) this.markDrawn(id, ball.index);
      });
    }
    this.goTo(LOTO_TIMINGS.draw, () => this.afterBall());
  }

  /** Joueurs dont la grille contient ce personnage et qui ne l'ont pas encore coché. */
  private holders(index: number): string[] {
    return this.players().filter((id) => {
      const pos = this.grid(id)?.indexOf(index) ?? -1;
      return pos >= 0 && !this.marked.get(id)![pos];
    });
  }

  private markDrawn(id: string, index: number): boolean {
    const pos = this.grid(id)?.indexOf(index) ?? -1;
    const m = this.marked.get(id);
    if (!m || pos < 0 || m[pos]) return false;
    m[pos] = true;
    if (this.checkWin()) return true;
    // Tout le monde a coché : boule suivante sans attendre.
    if (!this.holders(index).length) this.goTo(LOTO_TIMINGS.drawFast, () => this.afterBall());
    this.host.changed();
    return true;
  }

  private afterBall(): void {
    this.markable = null;
    this.draw();
  }

  /** Une ligne complète : la partie s'arrête (plusieurs gagnants possibles). */
  private checkWin(): boolean {
    const winners = this.players().filter((id) => hasLine(this.marked.get(id)!));
    if (!winners.length) return false;
    this.markable = null;
    this.lotoPhase = "draw";
    this.pickers = [];
    this.setStage("loto", null);
    this.goTo(3000, () => this.podium(winners));
    return true;
  }

  // ───────────── Mini-jeu ─────────────

  protected onMiniGameDone(ranking: string[][]): void {
    const winners = (ranking[0] ?? []).filter((id) => this.marked.has(id) && this.marked.get(id)!.some((m) => !m));
    const changes: RoundResult["changes"] = winners.map((id) => ({ playerId: id, points: 1 }));
    this.showResults(ranking, changes, () => (winners.length ? this.askPick(winners) : this.draw()));
  }

  private askPick(winners: string[]): void {
    this.module = null;
    this.participants = [];
    this.markable = null;
    this.lotoPhase = "pick";
    this.pickers = [...winners];
    const allBots = winners.every((id) => this.isBotOrAway(id));
    const wait = allBots ? LOTO_TIMINGS.botPick + 300 : LOTO_TIMINGS.pickTimeout;
    this.endsAt = this.host.now() + wait;
    this.setStage("loto", null);
    for (const id of winners) {
      if (!this.isBotOrAway(id)) continue;
      this.later(LOTO_TIMINGS.botPick, () => {
        if (!this.pickers.includes(id)) return;
        this.pick(id, this.bestCell(id));
        if (!this.pickers.length) this.afterPick();
        else this.host.changed();
      });
    }
    this.goTo(wait, () => {
      for (const id of [...this.pickers]) this.pick(id, this.bestCell(id));
      this.afterPick();
    });
  }

  /** Case qui rapproche le plus d'une ligne complète. */
  private bestCell(id: string): number {
    const m = this.marked.get(id)!;
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < LOTO_CELLS; i++) {
      if (m[i]) continue;
      const score = Math.max(...LOTO_LINES.filter((l) => l.includes(i)).map((l) => l.filter((c) => m[c]).length));
      if (score > bestScore) (best = i), (bestScore = score);
    }
    return best;
  }

  private pick(id: string, cell: number): void {
    const m = this.marked.get(id);
    if (!m || cell < 0 || cell >= LOTO_CELLS || m[cell]) return;
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

  // ───────────── Actions des joueurs ─────────────

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; cell?: unknown; grid?: unknown } | null;
    if (this.stage !== "loto" || !this.marked.has(playerId)) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type === "grid") {
      if (this.lotoPhase !== "choose" || typeof action.grid !== "number") throw new RoomError(ERRORS.badRequest);
      if (this.choice.get(playerId) !== null) throw new RoomError("Tu as déjà choisi ta grille.");
      if (!this.freeGrids().includes(action.grid)) throw new RoomError("Cette grille est déjà prise.");
      this.chooseGrid(playerId, action.grid);
      return;
    }
    if (action?.type !== "mark" || typeof action.cell !== "number" || !Number.isInteger(action.cell)) throw new RoomError(ERRORS.badRequest);
    const m = this.marked.get(playerId)!;
    if (action.cell < 0 || action.cell >= LOTO_CELLS || m[action.cell]) throw new RoomError(ERRORS.badRequest);
    if (this.lotoPhase === "pick") {
      if (!this.pickers.includes(playerId)) throw new RoomError(ERRORS.notYourTurn);
      this.pick(playerId, action.cell);
      if (!this.pickers.length) this.afterPick();
      else this.host.changed();
      return;
    }
    if (this.lotoPhase !== "draw") throw new RoomError(ERRORS.notYourTurn);
    const face = this.grid(playerId)?.[action.cell];
    if (face === undefined || face !== this.markable) {
      throw new RoomError(this.drawn.includes(face ?? -1) ? "Trop tard pour celui-là : il fallait le cocher à sa sortie !" : "Ce personnage n'est pas encore sorti.");
    }
    this.markDrawn(playerId, face);
  }
}

export const lotoMode: GameModeModule = { id: "loto", create: (host) => new LotoGame(host) };
