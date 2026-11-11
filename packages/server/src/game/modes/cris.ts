import { CREATURES, ERRORS, shuffled, type CrisState, type GameSnapshot, type Standing } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const CRIS_TIMINGS = {
  /** On pose les téléphones au milieu de la table. */
  place: 7_000,
  /** Sans bonne prise, la manche s'arrête au bout de… */
  listen: 25_000,
  claimed: 5_000,
  /** On revérifie qu'il y a assez de téléphones. */
  wait: 2_000,
  /** Temps de réaction des bots (min, max). */
  botMin: 6_000,
  botMax: 15_000,
};

/** Chance qu'un bot attrape le bon téléphone, selon la difficulté. */
const BOT_ACCURACY = { facile: 0.45, moyen: 0.65, difficile: 0.85 } as const;

/**
 * Mode « Cris en folie » : les téléphones des joueurs, posés au milieu de la table, poussent chacun le cri
 * d'une bête. L'écran montre une bête : le premier qui attrape le téléphone qui fait son cri et y touche son
 * propre visage marque un point. Se tromper bloque jusqu'à la manche suivante.
 *
 * Le téléphone attrapé envoie l'action au nom de son propriétaire, avec `by` = celui qui l'a attrapé.
 * Les bots n'ont pas de téléphone : ils « attrapent » au bout d'un temps de réaction.
 */
export class CrisGame extends BaseGame {
  protected readonly mode = "cris" as const;
  private state: CrisState;
  private gen = 0;

  constructor(host: GameHost) {
    super(host);
    const scores: Record<string, number> = {};
    for (const p of host.room.players) scores[p.id] = 0;
    this.state = {
      round: 0,
      goal: host.room.settings.cris.points,
      phase: "wait",
      sounds: {},
      target: null,
      endsAt: null,
      listenAt: null,
      lockedOut: [],
      lastClaim: null,
      scores,
    };
  }

  start(): void {
    this.setStage("cris", null);
    this.nextRound();
  }

  protected standings(): Standing[] {
    return Object.entries(this.state.scores).map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { cris: structuredClone(this.state) };
  }

  protected onMiniGameDone(): void {}

  playerRemoved(playerId: string): void {
    delete this.state.scores[playerId];
    if (this.state.phase === "listen" && playerId in this.state.sounds) this.nextRound();
    else this.host.changed();
  }

  /** Téléphones qui peuvent crier : ceux des joueurs humains connectés. */
  private devices(): string[] {
    return this.host.room.players.filter((p) => !p.isBot && p.connected).map((p) => p.id);
  }

  private players(): string[] {
    return Object.keys(this.state.scores).filter((id) => this.host.room.findPlayer(id));
  }

  private nextRound(): void {
    if (this.disposed) return;
    const gen = ++this.gen;
    const devices = this.devices();
    if (devices.length < 2) {
      this.state.phase = "wait";
      this.state.endsAt = null;
      this.host.changed();
      this.goTo(CRIS_TIMINGS.wait, () => this.nextRound());
      return;
    }
    // Un cri différent par téléphone, tiré au hasard à chaque manche.
    const pool = shuffled(() => this.host.random(), CREATURES.map((_, i) => i));
    this.state.sounds = Object.fromEntries(devices.map((id, i) => [id, pool[i % pool.length]!]));
    this.state.round++;
    this.state.target = null;
    this.state.lockedOut = [];
    this.state.lastClaim = null;
    this.state.listenAt = null;
    this.state.phase = "place";
    this.state.endsAt = this.host.now() + CRIS_TIMINGS.place;
    this.host.changed();
    this.goTo(CRIS_TIMINGS.place, () => gen === this.gen && this.listen());
  }

  private listen(): void {
    const gen = this.gen;
    const devices = Object.keys(this.state.sounds);
    const device = devices[Math.floor(this.host.random() * devices.length)]!;
    this.state.target = this.state.sounds[device]!;
    this.state.phase = "listen";
    this.state.listenAt = this.host.now();
    this.state.endsAt = this.host.now() + CRIS_TIMINGS.listen;
    this.host.changed();
    this.goTo(CRIS_TIMINGS.listen, () => gen === this.gen && this.finishRound(null));
    // Les bots tentent leur chance.
    const accuracy = BOT_ACCURACY[this.host.room.settings.botDifficulty];
    for (const id of this.players()) {
      if (!this.host.room.findPlayer(id)?.isBot) continue;
      const delay = CRIS_TIMINGS.botMin + this.host.random() * (CRIS_TIMINGS.botMax - CRIS_TIMINGS.botMin);
      this.later(delay, () => {
        if (gen !== this.gen || this.state.phase !== "listen") return;
        const good = devices.filter((d) => this.state.sounds[d] === this.state.target);
        const bad = devices.filter((d) => this.state.sounds[d] !== this.state.target);
        const pick = this.host.random() < accuracy || !bad.length ? good : bad;
        this.claim(pick[Math.floor(this.host.random() * pick.length)]!, id);
      });
    }
  }

  action(playerId: string, raw: unknown): void {
    const a = raw as { type?: unknown; by?: unknown } | null;
    if (this.stage !== "cris" || this.state.phase !== "listen") throw new RoomError("Attends que la bête s'affiche !");
    if (a?.type !== "claim" || typeof a.by !== "string") throw new RoomError(ERRORS.badRequest);
    if (!(playerId in this.state.sounds)) throw new RoomError("Ce téléphone ne joue pas cette manche.");
    if (!(a.by in this.state.scores) || this.host.room.findPlayer(a.by)?.isBot) throw new RoomError(ERRORS.badRequest);
    if (this.state.lockedOut.includes(a.by)) throw new RoomError("Tu t'es déjà trompé : attends la manche suivante !");
    this.claim(playerId, a.by);
  }

  private claim(device: string, by: string): void {
    const ok = this.state.sounds[device] === this.state.target;
    this.state.lastClaim = { by, device, ok, at: this.host.now() };
    if (ok) return this.finishRound(by);
    this.state.lockedOut.push(by);
    // Tout le monde s'est trompé : manche suivante.
    if (this.players().every((id) => this.state.lockedOut.includes(id))) return this.finishRound(null);
    this.host.changed();
  }

  private finishRound(winner: string | null): void {
    if (this.state.phase !== "listen") return;
    const gen = ++this.gen;
    if (winner) this.state.scores[winner] = (this.state.scores[winner] ?? 0) + 1;
    this.state.phase = "claimed";
    this.state.endsAt = this.host.now() + CRIS_TIMINGS.claimed;
    this.host.changed();
    this.goTo(CRIS_TIMINGS.claimed, () => {
      if (gen !== this.gen) return;
      const champions = this.players().filter((id) => (this.state.scores[id] ?? 0) >= this.state.goal);
      if (champions.length) {
        this.state.phase = "done";
        this.state.endsAt = null;
        return this.podium(champions);
      }
      this.nextRound();
    });
  }
}

export const crisMode: GameModeModule = { id: "cris", create: (host) => new CrisGame(host) };
