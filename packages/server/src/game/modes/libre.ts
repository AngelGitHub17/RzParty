import { ERRORS, LIBRE_POINTS, type GameSnapshot, type LibreState, type RoundResult, type Standing } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

/** Sans choix du chef au bout de ce temps, un mini-jeu est tiré au hasard. */
export const LIBRE_PICK_MS = 45_000;

/**
 * Mode « Jeu libre » : le chef choisit chaque mini-jeu (ou « Au hasard »). 3, 2 ou 1 point selon la place ;
 * le plus de points après le nombre de manches choisi gagne.
 */
export class LibreGame extends BaseGame {
  protected readonly mode = "libre" as const;
  private state: LibreState;
  private gen = 0;

  constructor(host: GameHost) {
    super(host);
    const scores: Record<string, number> = {};
    for (const p of host.room.players) scores[p.id] = 0;
    this.state = { round: 0, rounds: host.room.settings.libre.rounds, phase: "pick", played: [], choices: [], scores };
  }

  start(): void {
    this.pick();
  }

  protected standings(): Standing[] {
    return Object.entries(this.state.scores).map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { libre: structuredClone(this.state) };
  }

  playerRemoved(playerId: string): void {
    delete this.state.scores[playerId];
    this.readyIds.delete(playerId);
    this.host.changed();
  }

  private players(): string[] {
    return Object.keys(this.state.scores).filter((id) => this.host.room.findPlayer(id));
  }

  /** Mini-jeux jouables par les joueurs présents. */
  playable(): string[] {
    return this.miniGameCandidates(this.players()).map((m) => m.definition.id);
  }

  private pick(): void {
    if (this.disposed) return;
    const players = this.players();
    if (this.state.round >= this.state.rounds || players.length < 1) return this.finish();
    const gen = ++this.gen;
    this.state.phase = "pick";
    this.state.choices = this.playable();
    this.setStage("libre", LIBRE_PICK_MS);
    // Le chef est un bot, ou il traîne : au hasard.
    const chef = this.host.room.players.find((p) => p.isChef);
    const delay = !chef || this.isBotOrAway(chef.id) ? 2500 : LIBRE_PICK_MS;
    this.goTo(delay, () => gen === this.gen && this.launch(undefined));
  }

  action(playerId: string, raw: unknown): void {
    const a = raw as { type?: unknown; game?: unknown } | null;
    if (this.stage !== "libre" || this.state.phase !== "pick") throw new RoomError("Ce n'est pas le moment de choisir.");
    if (!this.host.room.findPlayer(playerId)?.isChef) throw new RoomError("C'est le chef qui choisit le mini-jeu.");
    if (a?.type !== "pick" || typeof a.game !== "string") throw new RoomError(ERRORS.badRequest);
    if (a.game !== "hasard" && !this.playable().includes(a.game)) throw new RoomError("Ce mini-jeu n'est pas jouable avec ces joueurs.");
    this.launch(a.game === "hasard" ? undefined : a.game);
  }

  private launch(game: string | undefined): void {
    this.gen++;
    this.state.round++;
    if (!this.startMiniGame(this.players(), "survie", game)) return this.finish();
    const id = this.module?.definition.id;
    if (id && !this.state.played.includes(id)) this.state.played.push(id);
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const changes: RoundResult["changes"] = [];
    ranking.forEach((group, place) => {
      const points = LIBRE_POINTS[place] ?? 0;
      if (!points) return;
      for (const id of group) {
        if (!(id in this.state.scores)) continue;
        this.state.scores[id]! += points;
        changes.push({ playerId: id, points });
      }
    });
    this.showResults(ranking, changes, () => this.pick());
  }

  private finish(): void {
    this.state.phase = "done";
    const ids = this.players();
    const best = Math.max(0, ...ids.map((id) => this.state.scores[id] ?? 0));
    this.podium(ids.filter((id) => (this.state.scores[id] ?? 0) === best));
  }
}

export const libreMode: GameModeModule = { id: "libre", create: (host) => new LibreGame(host) };
