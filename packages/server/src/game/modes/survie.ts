import type { RoundResult, Standing } from "@rzparty/shared";
import { BaseGame, ROUND_TIMINGS } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

/** Compatibilité : durées des étapes (voir ROUND_TIMINGS). */
export const SURVIE_TIMINGS = ROUND_TIMINGS;

/** Points marqués selon la place, en mode « score à atteindre ». */
const POINTS_BY_PLACE = [3, 1];

/**
 * Mode Survie : une suite de mini-jeux sans plateau.
 * - Règle « vies » : la (ou les) dernière(s) place(s) perd(ent) une vie ; à zéro, on est éliminé.
 * - Règle « score » : 3 points au premier, 1 au deuxième ; le premier au score visé gagne.
 */
export class SurvivalGame extends BaseGame {
  protected readonly mode = "survie" as const;
  private table = new Map<string, Standing>();

  constructor(host: GameHost) {
    super(host);
    const { rule, lives } = host.room.settings.survival;
    for (const p of host.room.players) {
      this.table.set(p.id, { playerId: p.id, lives: rule === "vies" ? lives : 0, score: 0, eliminated: false });
    }
  }

  start(): void {
    this.nextRound();
  }

  protected standings(): Standing[] {
    return [...this.table.values()].map((s) => ({ ...s }));
  }

  playerRemoved(playerId: string): void {
    const s = this.table.get(playerId);
    if (s) {
      s.eliminated = true;
      s.lives = 0;
    }
    this.readyIds.delete(playerId);
    this.host.changed();
  }

  private alive(): string[] {
    const inRoom = new Set(this.host.room.players.map((p) => p.id));
    return [...this.table.values()].filter((s) => !s.eliminated && inRoom.has(s.playerId)).map((s) => s.playerId);
  }

  private nextRound(): void {
    if (this.disposed) return;
    const alive = this.alive();
    const winners = this.findWinners(alive);
    if (winners) return this.podium(winners);
    if (!this.startMiniGame(alive, "survie")) this.podium(alive);
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const { rule } = this.host.room.settings.survival;
    const changes: RoundResult["changes"] = [];

    if (rule === "vies") {
      // Personne ne perd de vie si tout le monde est à égalité.
      const losers = ranking.length > 1 ? ranking.at(-1)! : [];
      for (const id of losers) {
        const s = this.table.get(id);
        if (!s || s.eliminated) continue;
        s.lives = Math.max(0, s.lives - 1);
        if (s.lives === 0) s.eliminated = true;
        changes.push({ playerId: id, lives: -1, eliminated: s.eliminated || undefined });
      }
    } else {
      ranking.forEach((group, place) => {
        const points = POINTS_BY_PLACE[place] ?? 0;
        if (!points) return;
        for (const id of group) {
          const s = this.table.get(id);
          if (!s) continue;
          s.score += points;
          changes.push({ playerId: id, points });
        }
      });
    }
    this.showResults(ranking, changes, () => this.nextRound());
  }

  /** Gagnants si la partie est finie, sinon null. */
  private findWinners(alive: string[]): string[] | null {
    const { rule, targetScore } = this.host.room.settings.survival;
    if (rule === "vies") {
      if (alive.length <= 1) return alive.length ? alive : (this.lastResult?.ranking[0] ?? []);
      return null;
    }
    if (alive.length <= 1) return alive;
    const best = Math.max(...alive.map((id) => this.table.get(id)!.score));
    if (best < targetScore) return null;
    return alive.filter((id) => this.table.get(id)!.score === best);
  }
}

export const survieMode: GameModeModule = {
  id: "survie",
  create: (host) => new SurvivalGame(host),
};
