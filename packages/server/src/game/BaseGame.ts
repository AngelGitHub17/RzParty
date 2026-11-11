import type { Difficulty, GameModeId, GameSnapshot, GameStage, MiniGamePurpose, RoundResult, Standing } from "@rzparty/shared";
import { MINI_GAMES, type BotProfile, type MiniGameServerModule } from "@rzparty/minigames/server";
import { MiniGameRunner } from "./MiniGameRunner.ts";
import type { GameHost, GameSession } from "./types.ts";

/** Durées des étapes communes, en millisecondes. */
export const ROUND_TIMINGS = {
  /** Présentation des règles (raccourcie si tout le monde est prêt). */
  intro: 12_000,
  introNoHumans: 5_000,
  countdown: 3_000,
  results: 7_000,
};

/**
 * Pour tester un mini-jeu précis : RZ_MINIGAMES=reflexes,calcul limite le tirage à ces mini-jeux.
 */
const ONLY_GAMES = (process.env.RZ_MINIGAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Socle commun à tous les modes : le déroulé d'une manche de mini-jeu
 * (règles → compte à rebours → jeu → résultats), le podium et les minuteurs.
 * Chaque mode décide QUAND lancer un mini-jeu et QUE FAIRE du classement.
 */
export abstract class BaseGame implements GameSession {
  protected abstract readonly mode: GameModeId;
  protected stage: GameStage = "intro";
  protected round = 0;
  protected stageEndsAt: number | null = null;
  protected module: MiniGameServerModule | null = null;
  protected purpose: MiniGamePurpose = "survie";
  protected participants: string[] = [];
  protected readyIds = new Set<string>();
  protected lastResult: RoundResult | null = null;
  protected winners: string[] = [];
  protected disposed = false;
  private lastModuleId: string | null = null;
  private runner: MiniGameRunner | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sideTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(protected readonly host: GameHost) {}

  abstract start(): void;
  /** Situation de chaque joueur (vies, score, pièces…). */
  protected abstract standings(): Standing[];
  /** Le mini-jeu est fini : le mode applique le classement puis enchaîne. */
  protected abstract onMiniGameDone(ranking: string[][]): void;
  /** Complète l'instantané (le plateau, par exemple). */
  protected extraSnapshot(): Partial<GameSnapshot> {
    return {};
  }

  snapshot(): GameSnapshot {
    const def = this.module?.definition;
    return {
      mode: this.mode,
      stage: this.stage,
      round: this.round,
      stageEndsAt: this.stageEndsAt,
      miniGame: def ? { id: def.id, name: def.name, rules: def.rules, category: def.category } : null,
      participants: [...this.participants],
      ready: [...this.readyIds],
      standings: this.standings(),
      lastResult: this.lastResult,
      winners: [...this.winners],
      purpose: this.purpose,
      board: null,
      ...this.extraSnapshot(),
    };
  }

  ready(playerId: string): void {
    if (this.stage !== "intro" || !this.participants.includes(playerId) || this.readyIds.has(playerId)) return;
    this.readyIds.add(playerId);
    this.host.changed();
    if (this.participants.every((id) => this.readyIds.has(id))) this.goTo(800, () => this.countdown());
  }

  input(playerId: string, round: number, input: unknown): void {
    if (this.stage === "play" && round === this.round) this.runner?.input(playerId, input);
  }

  /** Action hors mini-jeu (plateau). Ignorée par défaut. */
  action(_playerId: string, _action: unknown): void {}

  replay(playerId: string | null) {
    if (!this.runner || (this.stage !== "play" && this.stage !== "results")) return null;
    return {
      round: this.round,
      state: this.runner.lastState,
      private: playerId ? this.runner.lastPrivate.get(playerId) : undefined,
    };
  }

  abstract playerRemoved(playerId: string): void;

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    for (const t of this.sideTimers) clearTimeout(t);
    this.sideTimers.clear();
    this.runner?.stop();
    this.runner = null;
  }

  // ───────────── Manche de mini-jeu ─────────────

  /** Mini-jeux jouables par ces joueurs (en tenant compte du choix du chef). */
  protected miniGameCandidates(players: string[]): MiniGameServerModule[] {
    const candidates = MINI_GAMES.filter(
      (m) =>
        m.definition.players.min <= players.length &&
        players.length <= m.definition.players.max &&
        (!ONLY_GAMES.length || ONLY_GAMES.includes(m.definition.id)),
    );
    // Choix du chef (mode « mini-jeux au choix ») : s'il ne reste rien de jouable, on prend tout.
    const chosen = this.host.room.settings.miniGames ?? [];
    const allowed = candidates.filter((m) => chosen.includes(m.definition.id));
    if (chosen.length && allowed.length) return allowed;
    return candidates;
  }

  /**
   * Lance un mini-jeu pour ces joueurs (au hasard, ou celui demandé).
   * Renvoie false si aucun mini-jeu ne convient.
   */
  protected startMiniGame(players: string[], purpose: MiniGamePurpose, moduleId?: string): boolean {
    const candidates = this.miniGameCandidates(players);
    const forced = moduleId ? candidates.find((m) => m.definition.id === moduleId) : undefined;
    const pool = forced ? [forced] : candidates.length > 1 ? candidates.filter((m) => m.definition.id !== this.lastModuleId) : candidates;
    if (!pool.length) return false;
    this.module = pool[Math.floor(this.host.random() * pool.length)]!;
    this.lastModuleId = this.module.definition.id;
    this.purpose = purpose;
    this.round++;
    this.participants = [...players];
    this.lastResult = null;
    // Les bots et les absents n'ont pas besoin de lire les règles.
    this.readyIds = new Set(players.filter((id) => this.isBotOrAway(id)));
    // Sans humain à attendre, on laisse juste le temps de lire le nom du jeu à l'écran.
    const nobodyToWait = players.every((id) => this.readyIds.has(id));
    const introMs = nobodyToWait ? ROUND_TIMINGS.introNoHumans : ROUND_TIMINGS.intro;
    this.setStage("intro", introMs);
    this.goTo(introMs, () => this.countdown());
    return true;
  }

  private countdown(): void {
    this.setStage("countdown", ROUND_TIMINGS.countdown);
    this.goTo(ROUND_TIMINGS.countdown, () => this.play());
  }

  private play(): void {
    const module = this.module!;
    const round = this.round;
    const { room } = this.host;
    const difficulty = this.botDifficulty();

    const bots = new Map<string, BotProfile>();
    for (const id of this.participants) {
      const p = room.findPlayer(id);
      if (!p) continue;
      // Un vrai bot joue avec sa personnalité ; un humain absent est remplacé par un bot équilibré.
      if (p.isBot) bots.set(id, { personality: p.botPersonality ?? "equilibre", difficulty });
      else if (!p.connected) bots.set(id, { personality: "equilibre", difficulty });
    }
    // Mode « L'intrus » : un bot tricheur joue comme un champion.
    const cheater = this.cheaterFor(module.definition.id);
    if (cheater && bots.has(cheater)) bots.set(cheater, { personality: "lent-precis", difficulty: "difficile" });

    const runner = new MiniGameRunner({
      module,
      players: this.participants.flatMap((id) => {
        const p = room.findPlayer(id);
        return p ? [{ id: p.id, name: p.name, color: p.color }] : [];
      }),
      bots,
      random: () => this.host.random(),
      now: () => this.host.now(),
      publish: (state) => this.host.publishMiniGame(round, state),
      sendTo: (playerId, data) => this.host.sendPrivate(playerId, round, data),
      cheater,
      whisper: (playerId, text) => this.host.sendPrivate(playerId, round, { __whisper: text }),
    });
    this.runner = runner;
    this.setStage("play", null);
    runner.start();
    void runner.result.then(({ ranking, records }) => {
      if (this.disposed || this.round !== round) return;
      this.host.roundEnded?.({
        miniGameId: module.definition.id,
        players: this.participants.filter((id) => !runner.isBotDriven(id)),
        winners: ranking[0] ?? [],
        records,
      });
      this.onMiniGameDone(ranking);
    });
  }

  /** Affiche les résultats d'une manche, puis passe à la suite. */
  protected showResults(ranking: string[][], changes: RoundResult["changes"], next: () => void, extra: Partial<RoundResult> = {}): void {
    this.lastResult = { ...extra, ranking, changes };
    this.setStage("results", ROUND_TIMINGS.results);
    this.goTo(ROUND_TIMINGS.results, next);
  }

  protected podium(winners: string[]): void {
    this.winners = winners;
    this.host.gameEnded?.({ players: this.standings().map((s) => s.playerId), winners });
    this.module = null;
    this.participants = [];
    this.runner = null;
    this.setStage("podium", null);
  }

  /** Niveau des bots pour la manche (le réglage du salon, sauf mode qui le fait évoluer). */
  protected botDifficulty(): Difficulty {
    return this.host.room.settings.botDifficulty;
  }

  /** Le tricheur de la manche (mode « L'intrus ») ; aucun par défaut. */
  protected cheaterFor(_miniGameId: string): string | null {
    return null;
  }

  // ───────────── Outils ─────────────

  protected isBotOrAway(id: string): boolean {
    const p = this.host.room.findPlayer(id);
    return !p || p.isBot || !p.connected;
  }

  protected setStage(stage: GameStage, durationMs: number | null): void {
    this.stage = stage;
    this.stageEndsAt = durationMs === null ? null : this.host.now() + durationMs;
    this.host.changed();
  }

  protected goTo(delayMs: number, next: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) next();
    }, delayMs);
  }

  /** Minuteur secondaire (réflexion d'un bot…), annulé avec la partie. Ne remplace pas l'étape en cours. */
  protected later(delayMs: number, next: () => void): void {
    const t = setTimeout(() => {
      this.sideTimers.delete(t);
      if (!this.disposed) next();
    }, delayMs);
    this.sideTimers.add(t);
  }

  protected clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
