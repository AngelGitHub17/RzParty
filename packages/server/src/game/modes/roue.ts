import { ERRORS, WHEEL_SEGMENTS, WHEEL_START_POT, type GameSnapshot, type RoundResult, type Standing, type WheelTurn } from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const WHEEL_TIMINGS = {
  /** Annonce du tour. */
  roundIntro: 2000,
  /** La roue tourne (le navigateur anime pendant ce temps). */
  spinning: 3800,
  /** Affichage du résultat. */
  result: 2400,
  /** Un humain qui ne lance pas : lancer automatique. */
  spinTimeout: 20_000,
  botThink: 1200,
};

/**
 * Mode « Grande Roue » : chacun fait tourner la roue à son tour pour gagner des médailles.
 * Les pertes alimentent une cagnotte ; une case « Mini-jeu » la met en jeu pour tout le monde.
 * Au bout du nombre de tours choisi, le plus riche en médailles gagne.
 */
export class WheelGame extends BaseGame {
  protected readonly mode = "roue" as const;
  private medals = new Map<string, number>();
  private pot = WHEEL_START_POT;
  private order: string[];
  private wheelRound = 0;
  private turnIndex = -1;
  private turn: WheelTurn | null = null;
  private spinId = 0;
  private readonly rounds: number;

  constructor(host: GameHost) {
    super(host);
    this.rounds = host.room.settings.wheel.rounds;
    for (const p of host.room.players) this.medals.set(p.id, 0);
    this.order = [...this.medals.keys()].sort(() => host.random() - 0.5);
  }

  start(): void {
    this.beginRound();
  }

  protected standings(): Standing[] {
    return [...this.medals].map(([playerId, medals]) => ({ playerId, lives: 0, score: medals, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      wheel: {
        segments: WHEEL_SEGMENTS,
        medals: Object.fromEntries(this.medals),
        pot: this.pot,
        order: [...this.order],
        turn: this.turn ? { ...this.turn } : null,
        round: this.wheelRound,
        rounds: this.rounds,
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

  private beginRound(): void {
    if (this.disposed) return;
    this.wheelRound++;
    if (this.wheelRound > this.rounds) {
      this.wheelRound = this.rounds;
      const best = Math.max(...this.players().map((id) => this.medals.get(id) ?? 0));
      return this.podium(this.players().filter((id) => this.medals.get(id) === best));
    }
    this.turnIndex = -1;
    this.turn = null;
    this.module = null;
    this.participants = [];
    this.setStage("wheel", WHEEL_TIMINGS.roundIntro);
    this.goTo(WHEEL_TIMINGS.roundIntro, () => this.nextTurn());
  }

  private nextTurn(): void {
    if (this.disposed) return;
    this.module = null;
    this.participants = [];
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
    const action = raw as { type?: unknown } | null;
    if (this.stage !== "wheel" || !this.turn || this.turn.playerId !== playerId) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type === "spin" && this.turn.phase === "spin") return this.spin();
    throw new RoomError(ERRORS.badRequest);
  }

  private spin(): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "spin") return;
    turn.phase = "spinning";
    turn.segment = Math.floor(this.host.random() * WHEEL_SEGMENTS.length);
    turn.spinId = ++this.spinId;
    turn.endsAt = null;
    this.host.changed();
    this.goTo(WHEEL_TIMINGS.spinning, () => this.resolve());
  }

  private resolve(): void {
    const turn = this.turn!;
    const seg = WHEEL_SEGMENTS[turn.segment!]!;
    const id = turn.playerId;
    const mine = this.medals.get(id) ?? 0;
    const plural = (n: number) => `${n} médaille${n > 1 ? "s" : ""}`;
    turn.phase = "result";
    switch (seg.kind) {
      case "gain":
        this.medals.set(id, mine + seg.value);
        turn.text = `gagne ${plural(seg.value)} !`;
        break;
      case "double": {
        const gain = Math.max(10, mine);
        this.medals.set(id, mine + gain);
        turn.text = `double la mise : +${plural(gain)} !`;
        break;
      }
      case "perte": {
        const lost = Math.min(mine, seg.value);
        this.medals.set(id, mine - lost);
        this.pot += lost;
        turn.text = lost ? `perd ${plural(lost)}, qui partent dans la cagnotte.` : "n'a rien à perdre… ouf !";
        break;
      }
      case "banqueroute":
        this.medals.set(id, 0);
        this.pot += mine;
        turn.text = mine ? `fait banqueroute ! ${plural(mine)} partent dans la cagnotte.` : "fait banqueroute… mais n'avait rien !";
        break;
      case "vol": {
        const victims = this.players().filter((p) => p !== id).sort((a, b) => (this.medals.get(b) ?? 0) - (this.medals.get(a) ?? 0));
        const victim = victims[0];
        const taken = victim ? Math.min(this.medals.get(victim) ?? 0, seg.value) : 0;
        if (victim && taken) {
          this.medals.set(victim, (this.medals.get(victim) ?? 0) - taken);
          this.medals.set(id, mine + taken);
          turn.text = `vole ${plural(taken)} à ${this.host.room.findPlayer(victim)?.name ?? "?"} !`;
        } else turn.text = "veut voler… mais personne n'a de médailles !";
        break;
      }
      case "minijeu":
        turn.text = `déclenche un mini-jeu ! La cagnotte de ${plural(this.pot)} est en jeu.`;
        this.setStage("wheel", WHEEL_TIMINGS.result);
        this.goTo(WHEEL_TIMINGS.result, () => {
          if (!this.startMiniGame(this.players(), "cagnotte")) this.nextTurn();
        });
        return;
      default:
        turn.text = null;
    }
    this.setStage("wheel", WHEEL_TIMINGS.result);
    this.goTo(WHEEL_TIMINGS.result, () => this.nextTurn());
  }

  protected onMiniGameDone(ranking: string[][]): void {
    // Le (ou les) gagnant(s) du mini-jeu se partagent la cagnotte.
    const winners = ranking[0] ?? [];
    const share = winners.length ? Math.floor(this.pot / winners.length) : 0;
    const changes: RoundResult["changes"] = winners.map((id) => {
      this.medals.set(id, (this.medals.get(id) ?? 0) + share);
      return { playerId: id, points: share };
    });
    this.pot = WHEEL_START_POT;
    this.showResults(ranking, changes, () => {
      this.turn = null;
      this.nextTurn();
    });
  }
}

export const roueMode: GameModeModule = {
  id: "roue",
  create: (host) => new WheelGame(host),
};
