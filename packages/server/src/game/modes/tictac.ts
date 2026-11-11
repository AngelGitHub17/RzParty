import { BOMB_SYMBOLS, ERRORS, shuffled, WIRE_COLORS, tictacAnswerOk, type GameSnapshot, type Standing, type TictacState, type TictacTask } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const TICTAC_TIMINGS = {
  fuseMin: 25_000,
  fuseMax: 45_000,
  /** Une erreur raccourcit la mèche de… */
  slip: 4_000,
  boom: 3_500,
  /** Temps de réflexion des bots (min, max). */
  botMin: 2_200,
  botMax: 5_500,
};

/** Chance qu'un bot rate sa consigne, selon la difficulté. */
const BOT_SLIP = { facile: 0.35, moyen: 0.2, difficile: 0.08 } as const;

/**
 * Mode « Tic-tac-boum » : la bombe passe de joueur en joueur autour de la table. Pour la passer, son porteur
 * réussit la consigne affichée sur son écran (couper le bon fil, appuyer le bon nombre de fois…).
 * Une erreur raccourcit la mèche et donne une nouvelle consigne. Le porteur au moment de l'explosion prend
 * un BOUM ; après le nombre de bombes choisi, celui qui en a le moins gagne.
 */
export class TictacGame extends BaseGame {
  protected readonly mode = "tictac" as const;
  private state: TictacState;
  private fuseGen = 0;
  private explodesAt = 0;
  private fuse = 0;

  constructor(host: GameHost) {
    super(host);
    const booms: Record<string, number> = {};
    for (const p of host.room.players) booms[p.id] = 0;
    this.state = {
      bomb: 0,
      bombs: host.room.settings.tictac.bombs,
      holder: null,
      order: shuffled(() => host.random(), Object.keys(booms)),
      task: null,
      taskId: 0,
      heat: 0,
      slip: null,
      pass: null,
      booms,
      blast: null,
      phase: "play",
    };
  }

  start(): void {
    this.newBomb();
  }

  protected standings(): Standing[] {
    return Object.entries(this.state.booms).map(([playerId, b]) => ({ playerId, lives: 0, score: b, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { tictac: structuredClone(this.state) };
  }

  protected onMiniGameDone(): void {}

  playerRemoved(playerId: string): void {
    delete this.state.booms[playerId];
    const wasHolder = this.state.holder === playerId;
    const next = wasHolder ? this.nextHolder(playerId) : null;
    this.state.order = this.state.order.filter((id) => id !== playerId);
    if (wasHolder && next && next !== playerId && this.state.phase === "play") this.giveTo(next);
    else this.host.changed();
  }

  private players(): string[] {
    return this.state.order.filter((id) => this.host.room.findPlayer(id));
  }

  private nextHolder(from: string): string {
    const list = this.state.order;
    const i = list.indexOf(from);
    for (let k = 1; k <= list.length; k++) {
      const id = list[(i + k) % list.length]!;
      if (id !== from && this.host.room.findPlayer(id)) return id;
    }
    return from;
  }

  private newBomb(): void {
    if (this.disposed) return;
    if (this.state.bomb >= this.state.bombs || this.players().length < 2) {
      const fewest = Math.min(...this.players().map((id) => this.state.booms[id] ?? 0));
      this.state.phase = "done";
      this.state.task = null;
      return this.podium(this.players().filter((id) => this.state.booms[id] === fewest));
    }
    this.state.bomb++;
    this.state.blast = null;
    this.state.slip = null;
    this.state.pass = null;
    this.state.heat = 0;
    this.state.phase = "play";
    const gen = ++this.fuseGen;
    this.fuse = TICTAC_TIMINGS.fuseMin + this.host.random() * (TICTAC_TIMINGS.fuseMax - TICTAC_TIMINGS.fuseMin);
    this.explodesAt = this.host.now() + this.fuse;
    this.setStage("tictac", null);
    const players = this.players();
    this.giveTo(players[Math.floor(this.host.random() * players.length)]!);
    this.armFuse(gen);
    const heat = () => {
      if (gen !== this.fuseGen || this.disposed) return;
      const left = this.explodesAt - this.host.now();
      const h = left < this.fuse * 0.25 ? 2 : left < this.fuse * 0.55 ? 1 : 0;
      if (h !== this.state.heat) {
        this.state.heat = h as 0 | 1 | 2;
        this.host.changed();
      }
      this.later(500, heat);
    };
    this.later(500, heat);
  }

  /** (Re)programme l'explosion à `explodesAt`. */
  private armFuse(gen: number): void {
    this.goTo(Math.max(0, this.explodesAt - this.host.now()), () => gen === this.fuseGen && this.explode());
  }

  private makeTask(): TictacTask {
    const r = () => this.host.random();
    const pick = Math.floor(r() * 5);
    if (pick === 0) {
      const wires = shuffled(r, WIRE_COLORS.map((_, i) => i)).slice(0, 3 + Math.floor(r() * 2));
      return { kind: "fil", wires, target: wires[Math.floor(r() * wires.length)]! };
    }
    if (pick === 1) {
      const symbols = shuffled(r, BOMB_SYMBOLS.map((_, i) => i)).slice(0, 6);
      return { kind: "symbole", symbols, target: symbols[Math.floor(r() * symbols.length)]! };
    }
    if (pick === 2) return { kind: "compte", count: 3 + Math.floor(r() * 5) };
    if (pick === 3) return { kind: "maintiens", min: 2000, max: 3400 };
    const n = 4 + Math.floor(r() * 2);
    return { kind: "ordre", cells: shuffled(r, Array.from({ length: n }, (_, i) => i + 1)) };
  }

  private giveTo(id: string): void {
    this.state.holder = id;
    this.state.task = this.makeTask();
    this.state.taskId++;
    this.host.changed();
    if (this.isBotOrAway(id)) this.botTurn(id);
  }

  /** Un bot (ou un absent) réussit sa consigne… ou se trompe. */
  private botTurn(id: string): void {
    const gen = this.fuseGen;
    const taskId = this.state.taskId;
    const delay = TICTAC_TIMINGS.botMin + this.host.random() * (TICTAC_TIMINGS.botMax - TICTAC_TIMINGS.botMin);
    this.later(delay, () => {
      if (gen !== this.fuseGen || this.state.holder !== id || this.state.taskId !== taskId || this.state.phase !== "play") return;
      if (this.host.random() < BOT_SLIP[this.host.room.settings.botDifficulty]) this.slip(id);
      else this.passOn(id);
    });
  }

  action(playerId: string, raw: unknown): void {
    const a = raw as { type?: unknown; taskId?: unknown; answer?: unknown } | null;
    if (this.stage !== "tictac" || this.state.phase !== "play") throw new RoomError(ERRORS.notYourTurn);
    if (a?.type !== "task") throw new RoomError(ERRORS.badRequest);
    if (playerId !== this.state.holder) throw new RoomError("Ce n'est pas toi qui as la bombe !");
    // Réponse à une ancienne consigne : ignorée.
    if (a.taskId !== this.state.taskId || !this.state.task) return;
    if (tictacAnswerOk(this.state.task, a.answer)) this.passOn(playerId);
    else this.slip(playerId);
  }

  private passOn(from: string): void {
    const to = this.nextHolder(from);
    this.state.pass = { from, to, at: this.host.now() };
    this.state.slip = null;
    this.giveTo(to);
  }

  /** Erreur : la mèche raccourcit et une nouvelle consigne arrive. */
  private slip(id: string): void {
    this.state.slip = { playerId: id, at: this.host.now() };
    this.explodesAt = Math.max(this.host.now() + 1200, this.explodesAt - TICTAC_TIMINGS.slip);
    this.armFuse(this.fuseGen);
    this.giveTo(id);
  }

  private explode(): void {
    const victim = this.state.holder;
    if (this.disposed || !victim || this.state.phase !== "play") return;
    this.fuseGen++;
    this.state.booms[victim] = (this.state.booms[victim] ?? 0) + 1;
    this.state.blast = { playerId: victim, at: this.host.now() };
    this.state.phase = "boom";
    this.state.task = null;
    this.state.heat = 0;
    this.setStage("tictac", TICTAC_TIMINGS.boom);
    this.goTo(TICTAC_TIMINGS.boom, () => this.newBomb());
  }
}

export const tictacMode: GameModeModule = { id: "tictac", create: (host) => new TictacGame(host) };
