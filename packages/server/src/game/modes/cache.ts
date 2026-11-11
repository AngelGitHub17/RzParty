import { CACHE_TIMINGS, ERRORS, shuffled, type CacheState, type GameSnapshot, type Standing } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

/** Points : un par téléphone trouvé (pour celui qui le trouve), deux par téléphone resté caché (pour le cacheur). */
export const CACHE_POINTS = { found: 1, allFoundBonus: 1, unfound: 2 };

/**
 * Mode « Cache-cache » : à chaque manche, un joueur cache tous les téléphones dans la pièce (il touche
 * « Caché » sur chacun). Pendant la recherche, chaque téléphone caché sonne toutes les 10 secondes ;
 * on touche « Trouvé » dessus puis son propre visage. Chacun cache une fois par tour.
 * Les bots ne jouent pas (il faut chercher de vrais téléphones).
 */
export class CacheGame extends BaseGame {
  protected readonly mode = "cache" as const;
  private state: CacheState;
  private hiders: string[] = [];
  private gen = 0;

  constructor(host: GameHost) {
    super(host);
    this.state = {
      tour: 1,
      tours: host.room.settings.cache.tours,
      round: 0,
      phase: "wait",
      hider: null,
      devices: [],
      hidden: [],
      found: {},
      endsAt: null,
      seekAt: null,
      scores: {},
      last: null,
    };
    for (const p of host.room.players) if (!p.isBot) this.state.scores[p.id] = 0;
    this.hiders = shuffled(() => host.random(), Object.keys(this.state.scores));
  }

  start(): void {
    this.setStage("cache", null);
    this.nextRound();
  }

  protected standings(): Standing[] {
    return Object.entries(this.state.scores).map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { cache: structuredClone(this.state) };
  }

  protected onMiniGameDone(): void {}

  playerRemoved(playerId: string): void {
    delete this.state.scores[playerId];
    this.hiders = this.hiders.filter((id) => id !== playerId);
    this.state.devices = this.state.devices.filter((id) => id !== playerId);
    this.state.hidden = this.state.hidden.filter((id) => id !== playerId);
    delete this.state.found[playerId];
    if (this.state.hider === playerId && (this.state.phase === "intro" || this.state.phase === "hide")) return this.nextRound(true);
    this.checkProgress();
    this.host.changed();
  }

  private devices(): string[] {
    return this.host.room.players.filter((p) => !p.isBot && p.connected).map((p) => p.id);
  }

  /** Passe au cacheur suivant (`again` : refaire la manche avec un autre cacheur sans compter de tour). */
  private nextRound(again = false): void {
    if (this.disposed) return;
    const gen = ++this.gen;
    const devices = this.devices();
    if (devices.length < 2) {
      this.state.phase = "wait";
      this.state.endsAt = null;
      this.host.changed();
      this.goTo(2000, () => this.nextRound(again));
      return;
    }
    if (!again) {
      const done = this.state.round;
      const perTour = this.hiders.length;
      if (done >= perTour * this.state.tours) return this.finish();
      this.state.tour = Math.floor(done / perTour) + 1;
      this.state.round++;
    }
    const index = (this.state.round - 1) % this.hiders.length;
    // Le cacheur prévu est parti ou déconnecté : le suivant prend sa place.
    let hider = this.hiders[index]!;
    if (!devices.includes(hider)) hider = this.hiders.find((id) => devices.includes(id)) ?? devices[0]!;
    this.state.hider = hider;
    this.state.devices = devices;
    this.state.hidden = [];
    this.state.found = {};
    this.state.seekAt = null;
    this.state.phase = "intro";
    this.state.endsAt = this.host.now() + CACHE_TIMINGS.intro;
    this.host.changed();
    this.goTo(CACHE_TIMINGS.intro, () => gen === this.gen && this.hide());
  }

  private hide(): void {
    const gen = this.gen;
    this.state.phase = "hide";
    this.state.endsAt = this.host.now() + CACHE_TIMINGS.hide;
    this.host.changed();
    this.goTo(CACHE_TIMINGS.hide, () => gen === this.gen && this.seek());
  }

  private seek(): void {
    const gen = this.gen;
    // Un téléphone oublié (pas touché « Caché ») compte quand même : il est quelque part dans la pièce.
    this.state.hidden = [...this.state.devices];
    this.state.phase = "seek";
    this.state.seekAt = this.host.now();
    this.state.endsAt = this.host.now() + CACHE_TIMINGS.seek;
    this.host.changed();
    this.goTo(CACHE_TIMINGS.seek, () => gen === this.gen && this.reveal());
  }

  action(playerId: string, raw: unknown): void {
    const a = raw as { type?: unknown; by?: unknown } | null;
    if (this.stage !== "cache") throw new RoomError(ERRORS.notYourTurn);
    if (a?.type === "skip" && playerId === this.state.hider) {
      // Le cacheur a fini : on lance la recherche sans attendre la fin du temps.
      if (this.state.phase === "intro") return this.hide();
      if (this.state.phase === "hide") return this.seek();
      throw new RoomError(ERRORS.badRequest);
    }
    if (a?.type === "hidden") {
      if (this.state.phase !== "hide" || !this.state.devices.includes(playerId)) throw new RoomError("Ce n'est pas le moment de cacher.");
      if (!this.state.hidden.includes(playerId)) this.state.hidden.push(playerId);
      // Tous cachés : la recherche commence.
      if (this.state.devices.every((id) => this.state.hidden.includes(id))) return this.seek();
      return this.host.changed();
    }
    if (a?.type === "found" && typeof a.by === "string") {
      if (this.state.phase !== "seek" || !this.state.devices.includes(playerId)) throw new RoomError("Ce n'est pas le moment de chercher.");
      if (this.state.found[playerId]) throw new RoomError("Ce téléphone a déjà été trouvé !");
      if (!(a.by in this.state.scores) || a.by === this.state.hider) throw new RoomError("Le cacheur ne peut pas trouver ses propres cachettes !");
      this.state.found[playerId] = a.by;
      this.state.scores[a.by] = (this.state.scores[a.by] ?? 0) + CACHE_POINTS.found;
      if (!this.checkProgress()) this.host.changed();
      return;
    }
    throw new RoomError(ERRORS.badRequest);
  }

  /** Tous trouvés : fin de la manche. */
  private checkProgress(): boolean {
    if (this.state.phase !== "seek") return false;
    if (this.state.devices.every((id) => this.state.found[id])) {
      this.reveal();
      return true;
    }
    return false;
  }

  private reveal(): void {
    if (this.state.phase !== "seek") return;
    const gen = ++this.gen;
    const total = this.state.devices.length;
    const found = this.state.devices.filter((id) => this.state.found[id]).length;
    const hider = this.state.hider!;
    const seekersWin = found === total;
    if (seekersWin) {
      for (const id of Object.keys(this.state.scores)) if (id !== hider) this.state.scores[id] = (this.state.scores[id] ?? 0) + CACHE_POINTS.allFoundBonus;
    } else if (hider in this.state.scores) {
      this.state.scores[hider] = (this.state.scores[hider] ?? 0) + (total - found) * CACHE_POINTS.unfound;
    }
    this.state.last = { hider, found, total, seekersWin };
    this.state.phase = "reveal";
    this.state.endsAt = this.host.now() + CACHE_TIMINGS.reveal;
    this.host.changed();
    this.goTo(CACHE_TIMINGS.reveal, () => gen === this.gen && this.nextRound());
  }

  private finish(): void {
    this.state.phase = "done";
    this.state.endsAt = null;
    const ids = Object.keys(this.state.scores).filter((id) => this.host.room.findPlayer(id));
    const best = Math.max(0, ...ids.map((id) => this.state.scores[id] ?? 0));
    this.podium(ids.filter((id) => (this.state.scores[id] ?? 0) === best));
  }
}

export const cacheMode: GameModeModule = { id: "cache", create: (host) => new CacheGame(host) };
