import type {
  BotProfile,
  MiniGameBot,
  MiniGamePlayer,
  MiniGameRanking,
  MiniGameRecords,
  MiniGameServerLogic,
  MiniGameServerModule,
} from "@rzparty/minigames/server";

export interface RoundOutcome {
  ranking: MiniGameRanking;
  records: MiniGameRecords;
}

export interface RunnerOptions {
  module: MiniGameServerModule;
  players: MiniGamePlayer[];
  /** Joueurs pilotés par un bot (vrais bots et remplaçants des absents), avec leur profil. */
  bots: Map<string, BotProfile>;
  random(): number;
  now(): number;
  publish(state: unknown): void;
  sendTo(playerId: string, data: unknown): void;
}

/**
 * Fait tourner UNE manche d'un mini-jeu : minuteurs, bots, filet de sécurité.
 * Garantit un classement complet (chaque participant exactement une fois).
 */
export class MiniGameRunner {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private logic: MiniGameServerLogic | null = null;
  private drivers = new Map<string, MiniGameBot<unknown, unknown>>();
  private done = false;
  private resolve!: (outcome: RoundOutcome) => void;
  readonly result: Promise<RoundOutcome>;
  lastState: unknown = undefined;
  readonly lastPrivate = new Map<string, unknown>();

  constructor(private readonly opts: RunnerOptions) {
    this.result = new Promise((resolve) => (this.resolve = resolve));
  }

  start(): void {
    const { module, players, random, now } = this.opts;
    const schedule = (ms: number, fn: () => void) => {
      if (this.done) return;
      const t = setTimeout(() => {
        this.timers.delete(t);
        if (!this.done) fn();
      }, Math.max(0, ms));
      this.timers.add(t);
    };

    for (const [id, profile] of this.opts.bots) {
      const player = players.find((p) => p.id === id);
      if (!player) continue;
      this.drivers.set(
        id,
        module.bot({
          player,
          profile,
          random,
          now,
          schedule,
          // Les actions d'un bot passent par le même chemin que celles d'un humain.
          send: (input) => schedule(0, () => this.logic?.input(id, input)),
        }),
      );
    }

    this.logic = module.create({
      players,
      format: "chacun",
      random,
      now,
      schedule,
      publish: (state) => {
        if (this.done) return;
        this.lastState = state;
        this.opts.publish(state);
        for (const d of this.drivers.values()) schedule(0, () => d.onState(state));
      },
      sendTo: (playerId, data) => {
        if (this.done) return;
        this.lastPrivate.set(playerId, data);
        const driver = this.drivers.get(playerId);
        if (driver) schedule(0, () => driver.onPrivate?.(data));
        else this.opts.sendTo(playerId, data);
      },
      finish: (ranking, records) => this.finish(ranking, records),
    });

    // Filet de sécurité : un mini-jeu bloqué ne doit jamais figer la partie.
    schedule(module.definition.durationSec * 1000 + 15_000, () => this.finish([]));
    this.logic.start();
  }

  /** Action d'un humain. Ignorée s'il est piloté par un bot ou si la manche est finie. */
  input(playerId: string, input: unknown): void {
    if (this.done || this.drivers.has(playerId)) return;
    if (!this.opts.players.some((p) => p.id === playerId)) return;
    try {
      this.logic?.input(playerId, input);
    } catch (err) {
      console.error(`Mini-jeu ${this.opts.module.definition.id} : entrée refusée`, err);
    }
  }

  stop(): void {
    this.done = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /** Vrai si ce joueur est joué par un bot (vrai bot ou remplaçant d'un absent). */
  isBotDriven(playerId: string): boolean {
    return this.opts.bots.has(playerId);
  }

  private finish(ranking: MiniGameRanking, records: MiniGameRecords = {}): void {
    if (this.done) return;
    this.stop();
    const ids = this.opts.players.map((p) => p.id);
    // On ne garde que des records numériques valides de participants.
    const clean: MiniGameRecords = {};
    for (const id of ids) {
      const values = records[id];
      if (!values) continue;
      const kept = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
      if (Object.keys(kept).length) clean[id] = kept;
    }
    this.resolve({ ranking: normalizeRanking(ranking, ids), records: clean });
  }
}

/** Retire les inconnus et doublons, et place les oubliés en dernier (à égalité). */
export function normalizeRanking(ranking: MiniGameRanking, ids: string[]): MiniGameRanking {
  const valid = new Set(ids);
  const seen = new Set<string>();
  const groups: MiniGameRanking = [];
  for (const group of ranking) {
    const clean = group.filter((id) => valid.has(id) && !seen.has(id));
    clean.forEach((id) => seen.add(id));
    if (clean.length) groups.push(clean);
  }
  const missing = ids.filter((id) => !seen.has(id));
  if (missing.length) groups.push(missing);
  return groups;
}
