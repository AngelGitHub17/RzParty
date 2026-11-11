import { MINI_GAME_DEFINITIONS } from "@rzparty/minigames/catalog";
import { soloStageRule, type Difficulty, type GameSnapshot, type RoundResult, type SoloState, type Standing } from "@rzparty/shared";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const SOLO_MAP_MS = 6_000;

/**
 * Mode « Parcours solo » : une suite d'étapes, un mini-jeu chacune, contre des bots de plus en plus forts.
 * Pour franchir une étape, il faut finir dans les `needed` premiers (au début : la première moitié ;
 * à la fin : gagner). Sinon, on perd une vie et on retente l'étape. Les bots sont les adversaires :
 * ils ne progressent pas eux-mêmes. Sans humain, la partie s'arrête.
 */
export class SoloGame extends BaseGame {
  protected readonly mode = "solo" as const;
  private state: SoloState;

  constructor(host: GameHost) {
    super(host);
    const { stages, lives } = host.room.settings.solo;
    const humans = host.room.players.filter((p) => !p.isBot).map((p) => p.id);
    this.state = {
      stage: 1,
      stages,
      progress: Object.fromEntries(humans.map((id) => [id, 0])),
      lives: Object.fromEntries(humans.map((id) => [id, lives])),
      needed: 1,
      level: "facile",
      last: null,
      games: [],
    };
  }

  start(): void {
    this.showMap();
  }

  /** La carte du parcours, entre deux étapes. */
  private showMap(): void {
    if (this.disposed) return;
    this.prepare();
    this.setStage("solo", SOLO_MAP_MS);
    this.goTo(SOLO_MAP_MS, () => this.next());
  }

  protected botDifficulty(): Difficulty {
    return this.state.level;
  }

  protected standings(): Standing[] {
    return Object.keys(this.state.progress).map((playerId) => ({
      playerId,
      lives: this.state.lives[playerId] ?? 0,
      score: this.state.progress[playerId] ?? 0,
      eliminated: (this.state.lives[playerId] ?? 0) <= 0 || !this.host.room.findPlayer(playerId),
    }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { solo: structuredClone(this.state) };
  }

  playerRemoved(playerId: string): void {
    delete this.state.progress[playerId];
    delete this.state.lives[playerId];
    this.readyIds.delete(playerId);
    this.host.changed();
  }

  /** Humains encore en course (vies restantes, parcours pas fini). */
  private racing(): string[] {
    return Object.keys(this.state.progress).filter((id) => this.host.room.findPlayer(id) && (this.state.lives[id] ?? 0) > 0 && (this.state.progress[id] ?? 0) < this.state.stages);
  }

  /** Joueurs de la prochaine étape : les humains en course et les bots adversaires. */
  private players(): string[] {
    const bots = this.host.room.players.filter((p) => p.isBot).map((p) => p.id);
    return [...this.racing(), ...bots];
  }

  /** Prochaine étape : celle du joueur le moins avancé encore en course (tout le monde la joue ensemble). */
  private prepare(): void {
    const racing = this.racing();
    if (!racing.length) return;
    this.state.stage = Math.min(...racing.map((id) => (this.state.progress[id] ?? 0) + 1));
    const rule = soloStageRule(this.state.stage, this.state.stages, this.players().length);
    this.state.needed = rule.needed;
    this.state.level = rule.level;
  }

  private next(): void {
    if (this.disposed) return;
    if (!this.racing().length) return this.finish();
    this.prepare();
    if (!this.startMiniGame(this.players(), "survie")) return this.finish();
    const name = MINI_GAME_DEFINITIONS.find((d) => d.id === this.module?.definition.id)?.name;
    if (name) this.state.games[this.state.stage - 1] = name;
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const passed: string[] = [];
    const failed: string[] = [];
    let place = 0;
    for (const group of ranking) {
      for (const id of group) {
        if (!(id in this.state.progress) || !this.participants.includes(id)) continue;
        // Seuls ceux qui jouaient l'étape en cours avancent (les plus avancés aident sans rien risquer).
        if ((this.state.progress[id] ?? 0) + 1 !== this.state.stage) continue;
        if (place < this.state.needed) {
          this.state.progress[id]!++;
          passed.push(id);
        } else {
          this.state.lives[id] = Math.max(0, (this.state.lives[id] ?? 0) - 1);
          failed.push(id);
        }
      }
      place += group.length;
    }
    this.state.last = { passed, failed };
    const changes: RoundResult["changes"] = [
      ...passed.map((id) => ({ playerId: id, points: 1 })),
      ...failed.map((id) => ({ playerId: id, lives: -1, eliminated: (this.state.lives[id] ?? 0) <= 0 || undefined })),
    ];
    this.showResults(ranking, changes, () => (this.racing().length ? this.showMap() : this.finish()));
  }

  private finish(): void {
    const ids = Object.keys(this.state.progress).filter((id) => this.host.room.findPlayer(id));
    const best = Math.max(0, ...ids.map((id) => this.state.progress[id] ?? 0));
    const top = ids.filter((id) => (this.state.progress[id] ?? 0) === best);
    const lives = Math.max(...top.map((id) => this.state.lives[id] ?? 0));
    this.podium(top.filter((id) => (this.state.lives[id] ?? 0) === lives));
  }
}

export const soloMode: GameModeModule = { id: "solo", create: (host) => new SoloGame(host) };
