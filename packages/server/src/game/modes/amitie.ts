import {
  AMITIE_DILEMMAS,
  AMITIE_FINAL_WEIGHT,
  AMITIE_WHO,
  ERRORS,
  affinity,
  duoKey,
  type AmitieState,
  type GameSnapshot,
  type RoundResult,
  type Standing,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const AMITIE_TIMINGS = {
  intro: 2500,
  answer: 20_000,
  reveal: 5000,
  botThink: 2500,
  /** Révélation des taux d'amitié. */
  final: 10_000,
};

/**
 * Mode « Test d'amitié » : chacun répond en secret à des « plutôt ceci ou cela ? » et à des « qui de nous… ? ».
 * Chaque fois que deux joueurs répondent pareil, leur duo marque un point d'accord.
 * Après la dernière question, un mini-jeu final « synchro » rapproche ceux qui finissent près l'un de
 * l'autre. Puis le taux d'amitié (0 à 100) de chaque duo est révélé : le plus complice gagne.
 */
export class AmitieGame extends BaseGame {
  protected readonly mode = "amitie" as const;
  private dilemmas: number[];
  private who: number[];
  private amitieRound = 0;
  private state: AmitieState | null = null;
  private answers = new Map<string, number>();
  private agree = new Map<string, number>();
  private asked = 0;
  private ids: string[];
  /** Goûts « secrets » des bots, pour qu'ils restent cohérents. */
  private botLean = new Map<string, number>();

  constructor(host: GameHost) {
    super(host);
    this.ids = host.room.players.map((p) => p.id);
    for (const id of this.ids) this.botLean.set(id, host.random());
    this.dilemmas = AMITIE_DILEMMAS.map((_, i) => i).sort(() => host.random() - 0.5);
    this.who = AMITIE_WHO.map((_, i) => i).sort(() => host.random() - 0.5);
  }

  private rounds(): number {
    return this.host.room.settings.amitie.rounds;
  }

  start(): void {
    this.setStage("amitie", AMITIE_TIMINGS.intro);
    this.goTo(AMITIE_TIMINGS.intro, () => this.next());
  }

  /** Score de chacun : sa meilleure affinité. */
  protected standings(): Standing[] {
    return this.ids.map((playerId) => ({
      playerId,
      lives: 0,
      score: Math.max(0, ...this.players().filter((o) => o !== playerId).map((o) => affinity({ agree: Object.fromEntries(this.agree), asked: this.asked }, playerId, o))),
      eliminated: !this.host.room.findPlayer(playerId),
    }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      amitie: this.state
        ? { ...this.state, answered: [...this.answers.keys()], agree: Object.fromEntries(this.agree), asked: this.asked }
        : null,
    };
  }

  playerRemoved(playerId: string): void {
    this.answers.delete(playerId);
    if (this.state?.phase === "answer" && this.players().every((id) => this.answers.has(id))) this.reveal();
    else this.host.changed();
  }

  private players(): string[] {
    return this.ids.filter((id) => this.host.room.findPlayer(id));
  }

  private next(): void {
    if (this.disposed) return;
    const players = this.players();
    if (players.length < 2) return this.finish();
    // Après la dernière question : le mini-jeu final, puis le taux d'amitié.
    if (this.amitieRound >= this.rounds()) {
      if (!this.startMiniGame(players, "amitie")) this.showFinal();
      return;
    }
    this.module = null;
    this.participants = [];
    this.amitieRound++;
    this.answers.clear();
    // Une question sur trois : « Qui de nous… ? » (désigner un joueur).
    const isWho = this.amitieRound % 3 === 0;
    const kind: AmitieState["kind"] = isWho ? "qui" : "choix";
    let question: string;
    let options: string[];
    if (isWho) {
      question = AMITIE_WHO[this.who[(this.amitieRound / 3 - 1) % this.who.length]!]!;
      options = [...players];
    } else {
      const [q, a, b] = AMITIE_DILEMMAS[this.dilemmas[this.amitieRound % this.dilemmas.length]!]!;
      question = `${q.replace("…", "")} ${a.toLowerCase()} ou ${b.toLowerCase()} ?`;
      options = [a, b];
    }
    this.state = {
      round: this.amitieRound,
      rounds: this.rounds(),
      kind,
      question,
      options,
      phase: "answer",
      endsAt: this.host.now() + AMITIE_TIMINGS.answer,
      answered: [],
      answers: null,
      agree: {},
      asked: this.asked,
    };
    this.setStage("amitie", null);
    const round = this.amitieRound;
    for (const id of players) {
      if (!this.isBotOrAway(id)) continue;
      this.later(AMITIE_TIMINGS.botThink * (0.5 + this.host.random()), () => {
        if (this.state?.round !== round || this.state.phase !== "answer") return;
        // Un bot penche toujours un peu du même côté (sinon, au hasard).
        const lean = this.botLean.get(id) ?? 0.5;
        const choice = kind === "choix" ? (this.host.random() < 0.35 + lean * 0.3 ? 0 : 1) : Math.floor(this.host.random() * options.length);
        this.answer(id, choice);
      });
    }
    this.goTo(AMITIE_TIMINGS.answer, () => this.reveal());
  }

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; option?: unknown } | null;
    const s = this.state;
    if (this.stage !== "amitie" || s?.phase !== "answer" || !this.players().includes(playerId)) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type !== "answer" || typeof action.option !== "number" || !Number.isInteger(action.option) || action.option < 0 || action.option >= s.options.length) {
      throw new RoomError(ERRORS.badRequest);
    }
    if (this.answers.has(playerId)) throw new RoomError("Tu as déjà répondu.");
    this.answer(playerId, action.option);
  }

  private answer(playerId: string, option: number): void {
    if (this.answers.has(playerId)) return;
    this.answers.set(playerId, option);
    if (this.players().every((id) => this.answers.has(id))) this.goTo(600, () => this.reveal());
    else this.host.changed();
  }

  private reveal(): void {
    const s = this.state;
    if (!s || s.phase !== "answer") return;
    const players = this.players();
    this.asked++;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = this.answers.get(players[i]!);
        const b = this.answers.get(players[j]!);
        if (a !== undefined && a === b) this.bump(players[i]!, players[j]!);
      }
    }
    s.phase = "reveal";
    s.answers = Object.fromEntries(this.answers);
    s.endsAt = this.host.now() + AMITIE_TIMINGS.reveal;
    this.setStage("amitie", AMITIE_TIMINGS.reveal);
    this.goTo(AMITIE_TIMINGS.reveal, () => this.next());
  }

  private bump(a: string, b: string): void {
    const key = duoKey(a, b);
    this.agree.set(key, (this.agree.get(key) ?? 0) + 1);
  }

  /**
   * Mini-jeu final « synchro » : plus deux joueurs finissent près l'un de l'autre au classement,
   * plus leur duo se rapproche (même place : 3 accords, places voisines : 2, à deux places : 1).
   * Il compte comme 3 questions.
   */
  protected onMiniGameDone(ranking: string[][]): void {
    const groups = ranking.map((g) => g.filter((id) => this.ids.includes(id))).filter((g) => g.length);
    const place = new Map<string, number>();
    groups.forEach((g, i) => g.forEach((id) => place.set(id, i)));
    const players = this.players().filter((id) => place.has(id));
    this.asked += AMITIE_FINAL_WEIGHT;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const gap = Math.abs(place.get(players[i]!)! - place.get(players[j]!)!);
        for (let k = 0; k < Math.max(0, AMITIE_FINAL_WEIGHT - gap); k++) this.bump(players[i]!, players[j]!);
      }
    }
    this.showResults(ranking, [], () => this.showFinal());
  }

  /** Le taux d'amitié de chaque duo, révélé avant le podium. */
  private showFinal(): void {
    this.module = null;
    this.participants = [];
    if (this.state) this.state = { ...this.state, phase: "final", endsAt: null };
    this.setStage("amitie", AMITIE_TIMINGS.final);
    this.goTo(AMITIE_TIMINGS.final, () => this.finish());
  }

  private finish(): void {
    const players = this.players();
    const view = { agree: Object.fromEntries(this.agree), asked: this.asked };
    let best = -1;
    let duos: [string, string][] = [];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const v = affinity(view, players[i]!, players[j]!);
        if (v > best) (best = v), (duos = [[players[i]!, players[j]!]]);
        else if (v === best) duos.push([players[i]!, players[j]!]);
      }
    }
    this.podium([...new Set(duos.flat())]);
  }
}

export const amitieMode: GameModeModule = { id: "amitie", create: (host) => new AmitieGame(host) };
