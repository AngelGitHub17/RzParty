import { ERRORS, WORD_CATEGORIES, normalizeWord, type GameSnapshot, type MotsState, type Standing } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const MOTS_TIMINGS = {
  fuseMin: 18_000,
  fuseMax: 34_000,
  /** Les autres ont ce temps pour refuser un mot ; sans majorité contre, il est accepté. */
  vote: 4000,
  boom: 3000,
  botWord: 3500,
  botVote: 1200,
};

/**
 * Mode « Bombe à mots » : la bombe passe au voisin quand son porteur donne un mot de la catégorie
 * (écrit, ou dit à voix haute) que les autres ne refusent pas. Quand elle explose, son porteur
 * prend un BOUM. Après le nombre de bombes choisi, celui qui a le moins de BOUM gagne.
 */
export class WordBombGame extends BaseGame {
  protected readonly mode = "mots" as const;
  private booms = new Map<string, number>();
  private order: string[];
  private state: MotsState;
  private fuseGen = 0;
  private explodesAt = 0;
  private fuse = 0;
  private categories: string[];

  constructor(host: GameHost) {
    super(host);
    for (const p of host.room.players) this.booms.set(p.id, 0);
    this.order = [...this.booms.keys()].sort(() => host.random() - 0.5);
    this.categories = Object.keys(WORD_CATEGORIES).sort(() => host.random() - 0.5);
    this.state = {
      category: "",
      holder: null,
      pending: null,
      used: [],
      bomb: 0,
      bombs: host.room.settings.mots.bombs,
      booms: {},
      blast: null,
      heat: 0,
      phase: "play",
    };
  }

  start(): void {
    this.newBomb();
  }

  protected standings(): Standing[] {
    return [...this.booms].map(([playerId, b]) => ({ playerId, lives: 0, score: b, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return { mots: { ...this.state, booms: Object.fromEntries(this.booms), used: [...this.state.used], pending: this.state.pending ? structuredClone(this.state.pending) : null } };
  }

  protected onMiniGameDone(): void {}

  playerRemoved(playerId: string): void {
    if (this.state.holder === playerId) this.passTo(this.nextHolder(playerId));
    else this.host.changed();
  }

  private players(): string[] {
    return this.order.filter((id) => this.host.room.findPlayer(id));
  }

  private nextHolder(from: string): string {
    const list = this.players();
    const i = list.indexOf(from);
    return list[(i + 1) % list.length] ?? list[0]!;
  }

  private newBomb(): void {
    if (this.disposed) return;
    if (this.state.bomb >= this.state.bombs || this.players().length < 2) {
      const fewest = Math.min(...this.players().map((id) => this.booms.get(id) ?? 0));
      this.state.phase = "done";
      return this.podium(this.players().filter((id) => this.booms.get(id) === fewest));
    }
    this.state.bomb++;
    this.state.category = this.categories[(this.state.bomb - 1) % this.categories.length]!;
    this.state.used = [];
    this.state.blast = null;
    this.state.heat = 0;
    this.state.phase = "play";
    const players = this.players();
    const gen = ++this.fuseGen;
    this.fuse = MOTS_TIMINGS.fuseMin + this.host.random() * (MOTS_TIMINGS.fuseMax - MOTS_TIMINGS.fuseMin);
    this.explodesAt = this.host.now() + this.fuse;
    this.passTo(players[Math.floor(this.host.random() * players.length)]!);
    setTimeout(() => gen === this.fuseGen && this.explode(), this.fuse);
    const heat = () => {
      if (gen !== this.fuseGen || this.disposed) return;
      const left = this.explodesAt - this.host.now();
      const h = left < this.fuse * 0.25 ? 2 : left < this.fuse * 0.55 ? 1 : 0;
      if (h !== this.state.heat) {
        this.state.heat = h as 0 | 1 | 2;
        this.host.changed();
      }
      setTimeout(heat, 500);
    };
    setTimeout(heat, 500);
  }

  private passTo(id: string): void {
    this.state.holder = id;
    this.state.pending = null;
    this.setStage("mots", null);
    // Un bot (ou un absent) donne un mot de sa liste après un temps de réflexion.
    if (this.isBotOrAway(id)) {
      const gen = this.fuseGen;
      setTimeout(() => {
        if (this.disposed || gen !== this.fuseGen || this.state.holder !== id || this.state.pending || this.state.phase !== "play") return;
        const used = new Set(this.state.used.map(normalizeWord));
        const options = WORD_CATEGORIES[this.state.category]!.filter((w) => !used.has(normalizeWord(w)));
        const word = options[Math.floor(this.host.random() * options.length)] ?? "euh…";
        this.propose(id, word, false);
      }, MOTS_TIMINGS.botWord * (0.6 + this.host.random() * 0.8));
    }
  }

  action(playerId: string, raw: unknown): void {
    const a = raw as { type?: unknown; word?: unknown; ok?: unknown } | null;
    if (this.stage !== "mots" || this.state.phase !== "play") throw new RoomError(ERRORS.notYourTurn);
    if (a?.type === "word" && playerId === this.state.holder && !this.state.pending) {
      const spoken = a.word === null;
      const word = typeof a.word === "string" ? a.word.trim().slice(0, 30) : "";
      if (!spoken && !normalizeWord(word)) throw new RoomError(ERRORS.badRequest);
      if (!spoken && this.state.used.some((u) => normalizeWord(u) === normalizeWord(word))) throw new RoomError("Ce mot a déjà été dit !");
      return this.propose(playerId, spoken ? "" : word, spoken);
    }
    if (a?.type === "vote" && this.state.pending && playerId !== this.state.holder && typeof a.ok === "boolean") {
      this.state.pending.votes[playerId] = a.ok;
      return this.checkVotes();
    }
    throw new RoomError(ERRORS.badRequest);
  }

  private propose(playerId: string, word: string, spoken: boolean): void {
    this.state.pending = { word, spoken, votes: {} };
    this.host.changed();
    // Les bots valident presque toujours (ils refusent un mot inconnu de leur liste de temps en temps).
    const known = WORD_CATEGORIES[this.state.category]!.some((w) => normalizeWord(w) === normalizeWord(word));
    for (const id of this.players()) {
      if (id === playerId || !this.isBotOrAway(id)) continue;
      setTimeout(() => {
        if (!this.state.pending || this.state.holder !== playerId) return;
        this.state.pending.votes[id] = spoken || known || this.host.random() < 0.7;
        this.checkVotes();
      }, MOTS_TIMINGS.botVote * (0.5 + this.host.random()));
    }
    const gen = this.fuseGen;
    const pending = this.state.pending;
    setTimeout(() => gen === this.fuseGen && this.state.pending === pending && this.settle(true), MOTS_TIMINGS.vote);
  }

  /** Majorité contre : mot refusé. Tout le monde a voté pour : accepté sans attendre. */
  private checkVotes(): void {
    const p = this.state.pending;
    if (!p) return;
    const voters = this.players().filter((id) => id !== this.state.holder);
    const against = Object.values(p.votes).filter((v) => !v).length;
    const forCount = Object.values(p.votes).filter((v) => v).length;
    if (against > voters.length / 2) return this.settle(false);
    if (forCount + against === voters.length) return this.settle(against <= voters.length / 2);
    this.host.changed();
  }

  private settle(accepted: boolean): void {
    const p = this.state.pending;
    const holder = this.state.holder;
    if (this.disposed || !p || !holder || this.state.phase !== "play") return;
    if (accepted) {
      if (p.word) this.state.used.push(p.word);
      else this.state.used.push("(dit à voix haute)");
      this.passTo(this.nextHolder(holder));
    } else {
      this.state.pending = null;
      this.host.changed();
      if (this.isBotOrAway(holder)) this.passTo(holder);
    }
  }

  private explode(): void {
    const victim = this.state.holder;
    if (this.disposed || !victim || this.state.phase !== "play") return;
    this.booms.set(victim, (this.booms.get(victim) ?? 0) + 1);
    this.state.blast = { playerId: victim, at: this.host.now() };
    this.state.phase = "boom";
    this.state.pending = null;
    this.state.heat = 0;
    this.fuseGen++;
    this.setStage("mots", MOTS_TIMINGS.boom);
    this.goTo(MOTS_TIMINGS.boom, () => this.newBomb());
  }
}

export const motsMode: GameModeModule = { id: "mots", create: (host) => new WordBombGame(host) };
