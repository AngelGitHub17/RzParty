import { placePoints, shuffled, type BatailleState, type GameSnapshot, type RoundResult, type Standing } from "@rzparty/shared";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const BATAILLE_TIMINGS = { teams: 7_000, rope: 5_000 };

/**
 * Mode « Bataille » : deux équipes (Soleil et Lune) tirent sur une corde. Après chaque mini-jeu,
 * on additionne les points de place de chaque équipe (ramenés au nombre de joueurs, pour que 1 contre 2
 * reste équitable) ; la meilleure tire le foulard d'un cran. Elle gagne en l'amenant jusqu'à son camp.
 */
export class BatailleGame extends BaseGame {
  protected readonly mode = "bataille" as const;
  private state: BatailleState;

  constructor(host: GameHost) {
    super(host);
    // Équipes équilibrées, humains et bots mélangés au hasard.
    const ids = shuffled(() => host.random(), host.room.players.map((p) => p.id));
    const teams: [string[], string[]] = [[], []];
    ids.forEach((id, i) => teams[i % 2]!.push(id));
    this.state = { teams, rope: 0, goal: host.room.settings.bataille.pulls, round: 0, last: null, wins: Object.fromEntries(ids.map((id) => [id, 0])) };
  }

  start(): void {
    this.showRope();
  }

  /** La corde, entre deux mini-jeux (et au début, pour présenter les équipes). */
  private showRope(): void {
    if (this.disposed) return;
    const ms = this.state.round === 0 ? BATAILLE_TIMINGS.teams : BATAILLE_TIMINGS.rope;
    this.setStage("bataille", ms);
    this.goTo(ms, () => this.next());
  }

  protected standings(): Standing[] {
    return Object.entries(this.state.wins).map(([playerId, w]) => ({
      playerId,
      lives: 0,
      score: w,
      eliminated: !this.host.room.findPlayer(playerId),
    }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { bataille: structuredClone(this.state) };
  }

  playerRemoved(playerId: string): void {
    this.state.teams = this.state.teams.map((t) => t.filter((id) => id !== playerId)) as [string[], string[]];
    this.readyIds.delete(playerId);
    this.host.changed();
  }

  private present(team: string[]): string[] {
    return team.filter((id) => this.host.room.findPlayer(id));
  }

  private next(): void {
    if (this.disposed) return;
    const [a, b] = this.state.teams.map((t) => this.present(t));
    // Une équipe vide (tout le monde est parti) : l'autre gagne.
    if (!a!.length || !b!.length) return this.podium(a!.length ? a! : b!);
    const winner = this.state.rope <= -this.state.goal ? 0 : this.state.rope >= this.state.goal ? 1 : null;
    if (winner !== null) return this.podium(this.present(this.state.teams[winner]));
    this.state.round++;
    if (!this.startMiniGame([...a!, ...b!], "survie")) this.podium([...a!, ...b!]);
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const count = ranking.flat().length;
    const points: [number, number] = [0, 0];
    let place = 0;
    for (const group of ranking) {
      for (const id of group) {
        if (this.state.teams[0].includes(id)) points[0] += placePoints(place, count);
        else if (this.state.teams[1].includes(id)) points[1] += placePoints(place, count);
      }
      place += group.length;
    }
    // Moyenne par joueur : une petite équipe n'est pas désavantagée.
    const avg = points.map((p, i) => p / Math.max(1, this.present(this.state.teams[i]!).length)) as [number, number];
    const winner = avg[0] > avg[1] ? 0 : avg[1] > avg[0] ? 1 : null;
    if (winner !== null) {
      this.state.rope += winner === 0 ? -1 : 1;
      for (const id of this.state.teams[winner]) if (id in this.state.wins) this.state.wins[id]!++;
    }
    this.state.last = { winner, points: [Math.round(avg[0] * 10) / 10, Math.round(avg[1] * 10) / 10] };
    const changes: RoundResult["changes"] = winner === null ? [] : this.state.teams[winner].map((id) => ({ playerId: id, points: 1 }));
    this.showResults(ranking, changes, () => this.showRope());
  }
}

export const batailleMode: GameModeModule = { id: "bataille", create: (host) => new BatailleGame(host) };
