import {
  ERRORS, LUCKY_OUTCOMES, WHEEL_BANK_MAX, WHEEL_PHASES, WHEEL_START_BANK, WHEEL_START_MEDALS, wheelPhase,
  type GameSnapshot, type RoundResult, type Standing, type WheelBattle, type WheelTurn,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const WHEEL_TIMINGS = {
  /** Annonce du tour. */
  roundIntro: 2200,
  /** Annonce d'une nouvelle roue (le temps de la regarder). */
  newWheel: 4500,
  /** La roue tourne (le navigateur anime pendant ce temps). */
  spinning: 3800,
  /** La petite roue « Chance ». */
  lucky: 3200,
  /** Affichage du résultat. */
  result: 2600,
  /** Un humain qui ne joue pas : choix automatique. */
  spinTimeout: 20_000,
  chooseTimeout: 15_000,
  botThink: 1200,
};

/** Prolongations : au plus autant de tours qu'il y en avait dans la partie (10 au maximum). */
const MAX_OVERTIME = 10;

/**
 * Mode « Grande Roue » : 10 tours (5 ou 15 au choix), chacun lance la roue à son tour.
 * Joueurs et banque partent avec 500 médailles. Les cases donnent des médailles, en prennent
 * (qui vont à la banque), gonflent la banque ou déclenchent un mini-jeu :
 *   - Bataille : tout le monde joue, le gagnant rafle la banque (partagée en cas d'égalité) ;
 *   - 1 contre tous : le lanceur seul contre les autres, la banque au vainqueur ou partagée par l'équipe ;
 *   - Duel : le lanceur défie un joueur ; s'il gagne, il lui prend la moitié de ses médailles ;
 *   - Chance : une petite roue donne rien, la moitié ou toute la banque.
 * La roue change trois fois (vers 40 % et 70 % de la partie, puis en prolongations).
 * Prolongations : la partie se termine après la première « Bataille ».
 */
export class WheelGame extends BaseGame {
  protected readonly mode = "roue" as const;
  private medals = new Map<string, number>();
  private bank = WHEEL_START_BANK;
  private order: string[];
  private wheelRound = 0;
  private overtime = 0;
  private turnIndex = -1;
  private turn: WheelTurn | null = null;
  private battle: WheelBattle | null = null;
  private spinId = 0;
  private readonly rounds: number;
  /** Mini-jeu choisi par le dernier, pour la prochaine bataille. */
  private pickedGame: string | null = null;
  private finishing = false;

  constructor(host: GameHost) {
    super(host);
    this.rounds = host.room.settings.wheel.rounds;
    // Ordre de passage : l'ordre des joueurs dans le salon (J1, J2, J3, J4…).
    for (const p of host.room.players) this.medals.set(p.id, WHEEL_START_MEDALS);
    this.order = [...this.medals.keys()];
  }

  start(): void {
    this.beginRound();
  }

  private get phase(): number {
    return wheelPhase(this.wheelRound, this.rounds);
  }

  private get segments() {
    return WHEEL_PHASES[this.phase]!;
  }

  protected standings(): Standing[] {
    return [...this.medals].map(([playerId, medals]) => ({ playerId, lives: 0, score: medals, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      wheel: {
        segments: this.segments,
        phase: this.phase,
        medals: Object.fromEntries(this.medals),
        pot: this.bank,
        order: [...this.order],
        turn: this.turn ? { ...this.turn, options: this.turn.options?.map((o) => ({ ...o })) } : null,
        round: this.wheelRound,
        rounds: this.rounds,
        overtime: this.overtime,
        battle: this.battle ? { ...this.battle } : null,
      },
    };
  }

  playerRemoved(playerId: string): void {
    this.order = this.order.filter((id) => id !== playerId);
    this.readyIds.delete(playerId);
    if (this.turn?.playerId === playerId && this.stage === "wheel") this.nextTurn();
    else this.host.changed();
  }

  private players(): string[] {
    return this.order.filter((id) => this.host.room.findPlayer(id));
  }

  private get(id: string): number {
    return this.medals.get(id) ?? 0;
  }

  private add(id: string, n: number): void {
    this.medals.set(id, Math.max(0, this.get(id) + n));
  }

  private setBank(n: number): void {
    this.bank = Math.max(0, Math.min(WHEEL_BANK_MAX, Math.round(n)));
  }

  private name(id: string): string {
    return this.host.room.findPlayer(id)?.name ?? "?";
  }

  // ───────────── Tours ─────────────

  private beginRound(): void {
    if (this.disposed) return;
    const before = this.phase;
    this.wheelRound++;
    if (this.wheelRound > this.rounds) {
      this.overtime++;
      // Personne n'est tombé sur une Bataille : on la joue d'office.
      if (this.overtime > Math.min(MAX_OVERTIME, this.rounds)) {
        this.overtime--;
        this.wheelRound--;
        this.finishing = true;
        return this.launchBattle("bataille4", this.players()[0]!);
      }
    }
    this.turnIndex = -1;
    this.turn = null;
    this.battle = null;
    this.module = null;
    this.participants = [];
    const changed = this.phase !== before && this.wheelRound > 1;
    const wait = changed ? WHEEL_TIMINGS.newWheel : WHEEL_TIMINGS.roundIntro;
    this.setStage("wheel", wait);
    this.goTo(wait, () => this.nextTurn());
  }

  private nextTurn(): void {
    if (this.disposed) return;
    this.module = null;
    this.participants = [];
    this.battle = null;
    const players = this.players();
    this.turnIndex++;
    if (this.turnIndex >= players.length) return this.beginRound();
    const playerId = players[this.turnIndex]!;
    const wait = this.isBotOrAway(playerId) ? WHEEL_TIMINGS.botThink : WHEEL_TIMINGS.spinTimeout;
    this.turn = { playerId, phase: "spin", segment: null, spinId: this.spinId, text: null, endsAt: this.host.now() + wait };
    this.setStage("wheel", null);
    this.goTo(wait, () => this.spin());
  }

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; target?: unknown; game?: unknown } | null;
    const t = this.turn;
    if (this.stage !== "wheel" || !t) throw new RoomError(ERRORS.notYourTurn);
    if (t.phase === "spin" && t.playerId === playerId && action?.type === "spin") return this.spin();
    if (t.phase === "choose" && t.chooser === playerId && action?.type === "duel" && t.options?.some((o) => o.id === action.target)) {
      return this.startDuel(action.target as string);
    }
    if (t.phase === "pickgame" && t.chooser === playerId && action?.type === "pick" && t.options?.some((o) => o.id === action.game)) {
      this.pickedGame = action.game as string;
      return this.launchPicked();
    }
    throw new RoomError(t.playerId === playerId || t.chooser === playerId ? ERRORS.badRequest : ERRORS.notYourTurn);
  }

  private spin(): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "spin") return;
    turn.phase = "spinning";
    turn.segment = Math.floor(this.host.random() * this.segments.length);
    turn.spinId = ++this.spinId;
    turn.endsAt = null;
    this.host.changed();
    this.goTo(WHEEL_TIMINGS.spinning, () => this.resolve());
  }

  private show(text: string, next: () => void = () => this.nextTurn()): void {
    const turn = this.turn!;
    turn.phase = "result";
    turn.text = text;
    turn.endsAt = null;
    this.setStage("wheel", WHEEL_TIMINGS.result);
    this.goTo(WHEEL_TIMINGS.result, next);
  }

  private resolve(): void {
    const turn = this.turn!;
    const seg = this.segments[turn.segment!]!;
    const id = turn.playerId;
    const plural = (n: number) => `${n} médaille${n > 1 ? "s" : ""}`;
    switch (seg.kind) {
      case "gain": {
        // La banque paie ce qu'elle peut.
        const paid = Math.min(seg.value, this.bank);
        this.add(id, paid);
        this.setBank(this.bank - paid);
        return this.show(paid ? `gagne ${plural(paid)} de la banque !` : "devait gagner des médailles… mais la banque est vide !");
      }
      case "perte": {
        const lost = Math.min(this.get(id), seg.value);
        this.add(id, -lost);
        this.setBank(this.bank + lost);
        return this.show(lost ? `perd ${plural(lost)}, qui partent à la banque.` : "n'a rien à perdre… ouf !");
      }
      case "moitie": {
        const lost = Math.floor(this.get(id) / 2);
        this.add(id, -lost);
        this.setBank(this.bank + lost);
        return this.show(lost ? `perd la moitié de ses médailles : ${plural(lost)} à la banque !` : "n'a plus rien à perdre…");
      }
      case "banque":
        this.setBank(this.bank + seg.value);
        return this.show(`ajoute ${plural(seg.value)} à la banque !`);
      case "multi":
        this.setBank(this.bank * seg.value);
        return this.show(`multiplie la banque par ${seg.value} : elle contient ${plural(this.bank)} !`);
      case "chance": {
        turn.phase = "lucky";
        turn.lucky = Math.floor(this.host.random() * LUCKY_OUTCOMES.length);
        turn.text = null;
        this.setStage("wheel", WHEEL_TIMINGS.lucky);
        this.goTo(WHEEL_TIMINGS.lucky, () => {
          const outcome = LUCKY_OUTCOMES[turn.lucky!]!;
          const won = Math.floor(this.bank * outcome.share);
          this.add(id, won);
          this.setBank(this.bank - won);
          this.show(won ? `tente sa chance… et remporte ${plural(won)} !` : "tente sa chance… mais ne gagne rien !");
        });
        return;
      }
      case "duel":
        return this.askOpponent(id);
      case "bataille4":
      case "bataille13":
        if (this.wheelRound > this.rounds && seg.kind === "bataille4") this.finishing = true;
        return this.launchBattle(seg.kind, id);
    }
  }

  // ───────────── Mini-jeux ─────────────

  /** Duel : le lanceur choisit son adversaire (un bot vise le plus riche). */
  private askOpponent(id: string): void {
    const others = this.players().filter((p) => p !== id);
    if (!others.length) return this.show("voudrait un duel… mais il n'y a personne !");
    const turn = this.turn!;
    turn.phase = "choose";
    turn.chooser = id;
    turn.options = others.map((o) => ({ id: o, label: `${this.name(o)} (${this.get(o)})` }));
    turn.text = "défie un joueur en duel ! S'il gagne, il lui prend la moitié de ses médailles.";
    const bot = this.isBotOrAway(id);
    turn.endsAt = this.host.now() + (bot ? WHEEL_TIMINGS.botThink * 2 : WHEEL_TIMINGS.chooseTimeout);
    this.setStage("wheel", null);
    this.goTo(turn.endsAt - this.host.now(), () => {
      const richest = [...others].sort((a, b) => this.get(b) - this.get(a))[0]!;
      this.startDuel(richest);
    });
  }

  private startDuel(opponent: string): void {
    const turn = this.turn!;
    this.battle = { kind: "duel", solo: turn.playerId, opponent, bank: this.bank };
    turn.phase = "result";
    turn.options = undefined;
    turn.text = `défie ${this.name(opponent)} en duel !`;
    this.setStage("wheel", WHEEL_TIMINGS.result);
    this.goTo(WHEEL_TIMINGS.result, () => {
      if (!this.startMiniGame([turn.playerId, opponent], "duelroue")) this.nextTurn();
    });
  }

  /**
   * Bataille (tout le monde) ou 1 contre tous. À partir de la fin de partie, le dernier au
   * classement choisit le mini-jeu des batailles parmi trois.
   */
  private launchBattle(kind: "bataille4" | "bataille13", spinner: string): void {
    const players = this.players();
    this.battle = { kind, solo: kind === "bataille13" ? spinner : undefined, bank: this.bank };
    if (!this.turn) this.turn = { playerId: spinner, phase: "result", segment: null, spinId: this.spinId, text: null, endsAt: null };
    const turn = this.turn;
    const plural = `${this.bank} médaille${this.bank > 1 ? "s" : ""}`;
    turn.text =
      kind === "bataille13"
        ? `joue seul contre tous ! La banque (${plural}) est en jeu.`
        : this.finishing
          ? `déclenche la Bataille finale ! La banque (${plural}) est en jeu.`
          : `déclenche une Bataille ! La banque (${plural}) est en jeu.`;
    this.pickedGame = null;
    if (kind === "bataille4" && this.phase >= 2 && players.length > 2) {
      const last = [...players].sort((a, b) => this.get(a) - this.get(b))[0]!;
      const pool = this.miniGameCandidates(players);
      const options = [...pool].sort(() => this.host.random() - 0.5).slice(0, 3);
      if (options.length > 1) {
        turn.phase = "pickgame";
        turn.chooser = last;
        turn.options = options.map((m) => ({ id: m.definition.id, label: m.definition.name }));
        const bot = this.isBotOrAway(last);
        turn.endsAt = this.host.now() + (bot ? WHEEL_TIMINGS.botThink * 2 : WHEEL_TIMINGS.chooseTimeout);
        this.setStage("wheel", null);
        this.goTo(turn.endsAt - this.host.now(), () => {
          this.pickedGame = options[Math.floor(this.host.random() * options.length)]!.definition.id;
          this.launchPicked();
        });
        return;
      }
    }
    turn.phase = "result";
    this.setStage("wheel", WHEEL_TIMINGS.result);
    this.goTo(WHEEL_TIMINGS.result, () => this.launchPicked());
  }

  private launchPicked(): void {
    const turn = this.turn;
    if (turn) {
      turn.phase = "result";
      turn.options = undefined;
      turn.endsAt = null;
    }
    const game = this.pickedGame ?? undefined;
    if (!this.startMiniGame(this.players(), "cagnotte", game)) {
      this.battle = null;
      if (this.finishing) return this.end();
      this.nextTurn();
    }
  }

  protected onMiniGameDone(ranking: string[][]): void {
    const battle = this.battle;
    const changes: RoundResult["changes"] = [];
    const pay = (ids: string[], total: number) => {
      const share = ids.length ? Math.floor(total / ids.length) : 0;
      for (const id of ids) {
        this.add(id, share);
        changes.push({ playerId: id, points: share });
      }
      this.setBank(this.bank - share * ids.length);
    };
    const place = new Map<string, number>();
    ranking.forEach((group, i) => group.forEach((id) => place.set(id, i)));

    if (battle?.kind === "duel" && battle.solo && battle.opponent) {
      // Le lanceur gagne seul : il prend la moitié des médailles de l'adversaire.
      if ((place.get(battle.solo) ?? 9) < (place.get(battle.opponent) ?? 9)) {
        const taken = Math.floor(this.get(battle.opponent) / 2);
        this.add(battle.opponent, -taken);
        this.add(battle.solo, taken);
        changes.push({ playerId: battle.solo, points: taken }, { playerId: battle.opponent, points: -taken });
      }
    } else if (battle?.kind === "bataille13" && battle.solo) {
      // Le joueur seul contre la place moyenne de l'équipe.
      const team = [...place.keys()].filter((id) => id !== battle.solo);
      const mean = team.reduce((s, id) => s + place.get(id)!, 0) / Math.max(1, team.length);
      const solo = place.get(battle.solo) ?? 9;
      if (solo < mean) pay([battle.solo], this.bank);
      else if (solo > mean) pay(team, this.bank);
    } else {
      // Bataille : le (ou les) gagnant(s) se partagent la banque ; égalité générale = rien.
      const winners = ranking[0] ?? [];
      if (winners.length && winners.length < this.players().length) pay(winners, this.bank);
    }
    this.showResults(ranking, changes, () => {
      this.battle = null;
      if (this.finishing) return this.end();
      this.turn = null;
      this.nextTurn();
    });
  }

  private end(): void {
    const players = this.players();
    const best = Math.max(...players.map((id) => this.get(id)));
    this.battle = null;
    this.turn = null;
    this.podium(players.filter((id) => this.get(id) === best));
  }
}

export const roueMode: GameModeModule = {
  id: "roue",
  create: (host) => new WheelGame(host),
};
