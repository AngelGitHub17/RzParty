import { ERRORS, QUIZ_QUESTIONS, type GameSnapshot, type QuizState, type Standing } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const QUIZ_TIMINGS = {
  answer: 20_000,
  reveal: 5000,
  botThink: 2500,
};

/**
 * Mode « Quiz entre amis » : à chaque question, un joueur (la vedette) répond en secret sur lui-même ;
 * les autres parient sur sa réponse. +1 point par bon pari, et la vedette gagne 1 point par ami qui l'a
 * bien devinée. Le plus de points après toutes les questions gagne.
 */
export class QuizGame extends BaseGame {
  protected readonly mode = "quiz" as const;
  private scores = new Map<string, number>();
  private order: string[];
  private questions: number[];
  private quizRound = 0;
  private state: QuizState | null = null;
  private answers = new Map<string, number>();

  constructor(host: GameHost) {
    super(host);
    for (const p of host.room.players) this.scores.set(p.id, 0);
    this.order = [...this.scores.keys()].sort(() => host.random() - 0.5);
    this.questions = QUIZ_QUESTIONS.map((_, i) => i).sort(() => host.random() - 0.5);
  }

  start(): void {
    this.nextQuestion();
  }

  protected standings(): Standing[] {
    return [...this.scores].map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { quiz: this.state ? { ...this.state, scores: Object.fromEntries(this.scores), answered: [...this.answers.keys()] } : null };
  }

  protected onMiniGameDone(): void {}

  playerRemoved(playerId: string): void {
    this.answers.delete(playerId);
    if (this.state?.star === playerId && this.state.phase === "answer") this.reveal();
    else this.host.changed();
  }

  private players(): string[] {
    return this.order.filter((id) => this.host.room.findPlayer(id));
  }

  private nextQuestion(): void {
    if (this.disposed) return;
    const rounds = this.host.room.settings.quiz.rounds;
    if (this.quizRound >= rounds || this.players().length < 2) {
      const best = Math.max(...this.players().map((id) => this.scores.get(id) ?? 0));
      return this.podium(this.players().filter((id) => this.scores.get(id) === best));
    }
    const players = this.players();
    const star = players[this.quizRound % players.length]!;
    const q = QUIZ_QUESTIONS[this.questions[this.quizRound % this.questions.length]!]!;
    const name = this.host.room.findPlayer(star)?.name ?? "?";
    this.quizRound++;
    this.answers.clear();
    this.state = {
      round: this.quizRound,
      rounds,
      star,
      question: { text: q.text.replaceAll("{name}", name), options: [...q.options] },
      phase: "answer",
      endsAt: this.host.now() + QUIZ_TIMINGS.answer,
      answered: [],
      starAnswer: null,
      guesses: null,
      scores: {},
    };
    this.setStage("quiz", null);
    // Les bots (et les absents) répondent après un temps de réflexion.
    for (const id of players) {
      if (!this.isBotOrAway(id)) continue;
      const round = this.quizRound;
      setTimeout(() => {
        if (this.disposed || this.state?.round !== round || this.state.phase !== "answer") return;
        this.answer(id, Math.floor(this.host.random() * 4));
      }, QUIZ_TIMINGS.botThink * (0.5 + this.host.random()));
    }
    this.goTo(QUIZ_TIMINGS.answer, () => this.reveal());
  }

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; option?: unknown } | null;
    if (this.stage !== "quiz" || this.state?.phase !== "answer" || !this.players().includes(playerId)) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type !== "answer" || typeof action.option !== "number" || action.option < 0 || action.option > 3 || !Number.isInteger(action.option)) {
      throw new RoomError(ERRORS.badRequest);
    }
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
    const truth = this.answers.get(s.star);
    const guesses = Object.fromEntries([...this.answers].filter(([id]) => id !== s.star));
    if (truth !== undefined) {
      for (const [id, g] of Object.entries(guesses)) {
        if (g !== truth) continue;
        this.scores.set(id, (this.scores.get(id) ?? 0) + 1);
        this.scores.set(s.star, (this.scores.get(s.star) ?? 0) + 1);
      }
    }
    s.phase = "reveal";
    s.starAnswer = truth ?? null;
    s.guesses = guesses;
    s.endsAt = this.host.now() + QUIZ_TIMINGS.reveal;
    this.setStage("quiz", QUIZ_TIMINGS.reveal);
    this.goTo(QUIZ_TIMINGS.reveal, () => this.nextQuestion());
  }
}

export const quizMode: GameModeModule = { id: "quiz", create: (host) => new QuizGame(host) };
