import { DEFIS_POINTS, defisLevel, defisMultiplier, type DefisState, type Difficulty, type GameSnapshot, type RoundResult, type Standing } from "@rzparty/shared";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const DEFIS_BOARD_MS = 5_500;
export const DEFIS_END_MS = 9_000;

/**
 * Mode « Défis » : les humains, tous ensemble, contre les bots du salon. À chaque mini-jeu, le défi est
 * réussi si le meilleur humain finit devant le meilleur bot : l'équipe marque 100 points, +50 par humain
 * arrivé devant le meilleur bot, le tout multiplié par la série en cours (×1, ×1,5, ×2…). Un défi raté
 * coûte un cœur et remet la série à zéro. Les bots montent de niveau tous les 3 défis réussis.
 * Le score de l'équipe entre au tableau des records (data/defis.json).
 */
export class DefisGame extends BaseGame {
  protected readonly mode = "defis" as const;
  private state: DefisState;
  private cleared = 0;
  /** Points individuels (pour le podium : qui a le plus souvent battu les bots). */
  private personal: Record<string, number> = {};

  constructor(host: GameHost) {
    super(host);
    const hearts = host.room.settings.defis.hearts;
    for (const p of host.room.players) if (!p.isBot) this.personal[p.id] = 0;
    this.state = { round: 0, hearts, maxHearts: hearts, score: 0, streak: 0, level: "facile", last: null, place: null, records: host.challenges?.list() ?? [], phase: "board" };
  }

  start(): void {
    this.board();
  }

  protected botDifficulty(): Difficulty {
    return this.state.level;
  }

  protected standings(): Standing[] {
    return Object.keys(this.personal).map((playerId) => ({ playerId, lives: this.state.hearts, score: this.personal[playerId] ?? 0, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { defis: structuredClone(this.state) };
  }

  playerRemoved(playerId: string): void {
    delete this.personal[playerId];
    this.readyIds.delete(playerId);
    this.host.changed();
  }

  private humans(): string[] {
    return Object.keys(this.personal).filter((id) => this.host.room.findPlayer(id));
  }

  private bots(): string[] {
    return this.host.room.players.filter((p) => p.isBot).map((p) => p.id);
  }

  /** Le tableau de l'équipe entre deux défis. */
  private board(): void {
    if (this.disposed) return;
    this.setStage("defis", DEFIS_BOARD_MS);
    this.goTo(DEFIS_BOARD_MS, () => this.next());
  }

  private next(): void {
    if (this.disposed) return;
    const humans = this.humans();
    const bots = this.bots();
    if (this.state.hearts <= 0 || !humans.length || !bots.length) return this.finish();
    this.state.round++;
    this.state.level = defisLevel(this.cleared);
    if (!this.startMiniGame([...humans, ...bots], "survie")) this.finish();
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const bots = new Set(this.bots());
    // Place du meilleur bot ; les humains strictement devant lui ont « battu » les bots.
    let botPlace = Infinity;
    let place = 0;
    const placeOf: Record<string, number> = {};
    for (const group of ranking) {
      for (const id of group) {
        placeOf[id] = place;
        if (bots.has(id)) botPlace = Math.min(botPlace, place);
      }
      place += group.length;
    }
    const ahead = this.humans().filter((id) => (placeOf[id] ?? Infinity) < botPlace);
    const ok = ahead.length > 0;
    const changes: RoundResult["changes"] = [];
    if (ok) {
      const multiplier = defisMultiplier(this.state.streak);
      const points = Math.round((DEFIS_POINTS.base + DEFIS_POINTS.perAhead * ahead.length) * multiplier);
      this.state.score += points;
      this.state.streak++;
      this.cleared++;
      this.state.last = { ok, points, ahead, multiplier };
      for (const id of ahead) {
        this.personal[id] = (this.personal[id] ?? 0) + 1;
        changes.push({ playerId: id, points: 1 });
      }
    } else {
      this.state.hearts--;
      this.state.last = { ok, points: 0, ahead: [], multiplier: defisMultiplier(this.state.streak) };
      this.state.streak = 0;
      for (const id of this.humans()) changes.push({ playerId: id, lives: -1 });
    }
    this.showResults(ranking, changes, () => (this.state.hearts > 0 ? this.board() : this.finish()));
  }

  private finish(): void {
    if (this.disposed) return;
    const humans = this.humans();
    const names = humans.map((id) => this.host.room.findPlayer(id)?.name ?? "?");
    if (this.state.place === null) {
      this.state.place = this.host.challenges ? this.host.challenges.submit(this.state.score, names, this.host.now()) : -1;
      this.state.records = this.host.challenges?.list() ?? [];
    }
    this.state.phase = "done";
    // On montre le score final et le tableau des records avant le podium.
    this.setStage("defis", DEFIS_END_MS);
    this.goTo(DEFIS_END_MS, () => {
      const best = Math.max(0, ...humans.map((id) => this.personal[id] ?? 0));
      this.podium(humans.filter((id) => (this.personal[id] ?? 0) === best));
    });
  }
}

export const defisMode: GameModeModule = { id: "defis", create: (host) => new DefisGame(host) };
