import { ERRORS, INTRUS_GAMES, INTRUS_POINTS, shuffled, type GameSnapshot, type IntrusState, type RoundResult, type Standing } from "@rzparty/shared";
import { MINI_GAME_DEFINITIONS } from "@rzparty/minigames/catalog";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const INTRUS_TIMINGS = { brief: 6_000, vote: 25_000, reveal: 8_000 };

/**
 * Mode « L'intrus » : à chaque manche, un joueur est désigné en secret et reçoit des coups de pouce
 * pendant le mini-jeu (la bonne réponse, la bonne case…). Ensuite, chacun vote pour le tricheur.
 * Points : 3/2/1 selon la place au mini-jeu, +2 par bon soupçon, +3 à l'intrus si moins de la moitié
 * l'a démasqué.
 */
export class IntrusGame extends BaseGame {
  protected readonly mode = "intrus" as const;
  private state: IntrusState;
  private cheater: string | null = null;
  private votes: Record<string, string> = {};
  private order: string[] = [];
  private gen = 0;

  constructor(host: GameHost) {
    super(host);
    const scores: Record<string, number> = {};
    for (const p of host.room.players) scores[p.id] = 0;
    this.state = { round: 0, rounds: host.room.settings.intrus.rounds, phase: "brief", endsAt: null, game: null, voted: [], reveal: null, scores };
    // Chacun sera l'intrus à son tour (dans un ordre secret), avant que quelqu'un le soit deux fois.
    this.order = shuffled(() => host.random(), Object.keys(scores));
  }

  start(): void {
    this.nextRound();
  }

  protected standings(): Standing[] {
    return Object.entries(this.state.scores).map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { intrus: structuredClone(this.state) };
  }

  /** Le tricheur ne triche que pendant le mini-jeu de sa manche. */
  protected cheaterFor(): string | null {
    return this.cheater;
  }

  boardPrivate(playerId: string) {
    return { items: [], intrus: this.state.phase === "brief" || this.stage !== "intrus" ? playerId === this.cheater : false };
  }

  playerRemoved(playerId: string): void {
    delete this.state.scores[playerId];
    this.order = this.order.filter((id) => id !== playerId);
    this.readyIds.delete(playerId);
    if (this.stage === "intrus" && this.state.phase === "vote" && this.everyoneVoted()) return this.reveal();
    this.host.changed();
  }

  private players(): string[] {
    return Object.keys(this.state.scores).filter((id) => this.host.room.findPlayer(id));
  }

  private nextRound(): void {
    if (this.disposed) return;
    const players = this.players();
    if (this.state.round >= this.state.rounds || players.length < 2) return this.finish();
    this.state.round++;
    const gen = ++this.gen;
    const pool = this.order.filter((id) => players.includes(id));
    this.cheater = pool[(this.state.round - 1) % pool.length]!;
    this.votes = {};
    this.state.phase = "brief";
    this.state.voted = [];
    this.state.reveal = null;
    this.state.game = null;
    this.state.endsAt = this.host.now() + INTRUS_TIMINGS.brief;
    // Seul l'intrus apprend qu'il triche (avant l'affichage de l'annonce).
    for (const id of players) this.host.sendBoardPrivate?.(id, { items: [], intrus: id === this.cheater });
    this.setStage("intrus", INTRUS_TIMINGS.brief);
    this.goTo(INTRUS_TIMINGS.brief, () => gen === this.gen && this.playRound());
  }

  private playRound(): void {
    const players = this.players();
    const fits = this.miniGameCandidates(players).filter((m) => (INTRUS_GAMES as readonly string[]).includes(m.definition.id));
    const id = fits.length ? fits[Math.floor(this.host.random() * fits.length)]!.definition.id : undefined;
    this.state.game = id ? (MINI_GAME_DEFINITIONS.find((m) => m.id === id)?.name ?? id) : null;
    if (!this.startMiniGame(players, "survie", id)) this.finish();
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const changes: RoundResult["changes"] = [];
    ranking.forEach((group, place) => {
      const points = INTRUS_POINTS.places[place] ?? 0;
      if (!points) return;
      for (const id of group) {
        if (!(id in this.state.scores)) continue;
        this.state.scores[id]! += points;
        changes.push({ playerId: id, points });
      }
    });
    this.showResults(ranking, changes, () => this.vote());
  }

  private vote(): void {
    const gen = ++this.gen;
    this.state.phase = "vote";
    this.state.endsAt = this.host.now() + INTRUS_TIMINGS.vote;
    this.setStage("intrus", INTRUS_TIMINGS.vote);
    this.goTo(INTRUS_TIMINGS.vote, () => gen === this.gen && this.reveal());
    // Les bots (et les absents) soupçonnent surtout ceux qui ont trop bien réussi.
    const best = this.lastResult?.ranking[0] ?? [];
    for (const id of this.players()) {
      if (!this.isBotOrAway(id)) continue;
      this.later(2000 + this.host.random() * 8000, () => {
        if (gen !== this.gen || this.state.phase !== "vote") return;
        const others = this.players().filter((x) => x !== id);
        const top = best.filter((x) => x !== id);
        const pick = top.length && this.host.random() < 0.6 ? top : others;
        if (pick.length) this.castVote(id, pick[Math.floor(this.host.random() * pick.length)]!);
      });
    }
  }

  action(playerId: string, raw: unknown): void {
    const a = raw as { type?: unknown; suspect?: unknown } | null;
    if (this.stage !== "intrus" || this.state.phase !== "vote") throw new RoomError("Ce n'est pas le moment de voter.");
    if (a?.type !== "vote" || typeof a.suspect !== "string" || !(a.suspect in this.state.scores)) throw new RoomError(ERRORS.badRequest);
    if (a.suspect === playerId) throw new RoomError("Tu ne peux pas voter pour toi !");
    if (playerId in this.votes) throw new RoomError("Tu as déjà voté.");
    this.castVote(playerId, a.suspect);
  }

  private castVote(voter: string, suspect: string): void {
    this.votes[voter] = suspect;
    this.state.voted = Object.keys(this.votes);
    if (this.everyoneVoted()) return this.reveal();
    this.host.changed();
  }

  private everyoneVoted(): boolean {
    return this.players().every((id) => id in this.votes);
  }

  private reveal(): void {
    if (this.state.phase !== "vote" || !this.cheater) return;
    const gen = ++this.gen;
    const cheater = this.cheater;
    const gains: Record<string, number> = {};
    // L'intrus vote aussi (pour ne pas se trahir), mais son vote ne compte pas.
    const voters = Object.keys(this.votes).filter((id) => id !== cheater);
    const caught = voters.filter((id) => this.votes[id] === cheater);
    for (const id of caught) gains[id] = INTRUS_POINTS.caught;
    if (caught.length * 2 < Math.max(1, voters.length)) gains[cheater] = INTRUS_POINTS.unseen;
    for (const [id, g] of Object.entries(gains)) if (id in this.state.scores) this.state.scores[id]! += g;
    this.state.phase = "reveal";
    this.state.reveal = { cheater, votes: { ...this.votes }, gains };
    this.state.endsAt = this.host.now() + INTRUS_TIMINGS.reveal;
    this.cheater = null;
    this.setStage("intrus", INTRUS_TIMINGS.reveal);
    this.goTo(INTRUS_TIMINGS.reveal, () => gen === this.gen && this.nextRound());
  }

  private finish(): void {
    this.state.phase = "done";
    this.state.endsAt = null;
    this.cheater = null;
    const ids = this.players();
    const best = Math.max(0, ...ids.map((id) => this.state.scores[id] ?? 0));
    this.podium(ids.filter((id) => (this.state.scores[id] ?? 0) === best));
  }
}

export const intrusMode: GameModeModule = { id: "intrus", create: (host) => new IntrusGame(host) };
