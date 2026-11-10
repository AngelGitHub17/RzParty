import {
  ERRORS,
  ILE_BONUS_NAMES,
  ILE_ERUPTION_BACK,
  ILE_GATES,
  ILE_LAST_CELL,
  ILE_SPIKE_BACK,
  ILE_SUMMIT,
  ILE_VOLCANO,
  clampForward,
  gateAfter,
  generateIsland,
  ileBonusForPlace,
  type GameSnapshot,
  type IleCellType,
  type IlePawn,
  type IleRoll,
  type IleTurn,
  type RoundResult,
  type Standing,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const ILE_TIMINGS = {
  intro: 3000,
  /** Attente du lancer (humain). */
  rollTimeout: 20_000,
  botThink: 1100,
  /** Affichage des dés avant de bouger. */
  dice: 1500,
  step: 300,
  /** Affichage du résultat d'un défi ou d'un effet. */
  show: 1900,
  /** Le dé d'un défi roule avant le résultat. */
  gateDice: 1300,
  choiceTimeout: 20_000,
};

/** Au-delà, la partie s'arrête : le plus haut sur l'île gagne. */
const MAX_ROUNDS = 60;

/**
 * Mode « Île aux défis » : course jusqu'au sommet d'une île de 72 cases. Chaque tour commence par
 * un mini-jeu qui fixe l'ordre et donne un dé bonus (or 1-6, argent 1-3, bronze 1-2). On lance le dé
 * normal et son dé bonus (s'ils font le même chiffre, on relance un dé en plus) et on avance d'autant.
 * Six défis barrent la route : on s'arrête devant pour les tenter. Les cases spéciales font avancer,
 * reculer, échanger, lancer des mini-jeux 1 contre tous ou des duels, ou envoient dans le volcan.
 * Au sommet, il faut encore faire 6 ou plus avec ses dés au tour suivant pour gagner.
 */
export class IleGame extends BaseGame {
  protected readonly mode = "ile" as const;
  private cells: IleCellType[];
  private pawns = new Map<string, IlePawn>();
  private bonus = new Map<string, number | null>();
  private spikeNeed = new Map<string, number>();
  private order: string[];
  private turnIndex = -1;
  private ileRound = 0;
  private dragonBroken = false;
  private eruption = 0;
  private turn: IleTurn | null = null;
  private flash: { playerId: string; text: string } | null = null;
  private duelTarget: string | null = null;
  /** Pas restants quand on s'arrête devant les caisses et tonneaux. */
  private remainingSteps: number | null = null;
  private rollId = 0;
  /** Défi qui attend son lancer de dé. */
  private pendingGate: { gate: number; steps: number } | null = null;

  constructor(host: GameHost) {
    super(host);
    this.cells = generateIsland(Math.floor(host.random() * 2 ** 31));
    for (const p of host.room.players) {
      this.pawns.set(p.id, { cell: 0, volcano: null });
      this.bonus.set(p.id, null);
      this.spikeNeed.set(p.id, 5);
    }
    this.order = [...this.pawns.keys()];
  }

  start(): void {
    this.setStage("ile", ILE_TIMINGS.intro);
    this.goTo(ILE_TIMINGS.intro, () => this.nextRound());
  }

  protected standings(): Standing[] {
    return [...this.pawns].map(([playerId, p]) => ({ playerId, lives: 0, score: p.cell, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      ile: {
        cells: this.cells,
        pawns: Object.fromEntries([...this.pawns].map(([id, p]) => [id, { ...p }])),
        bonus: Object.fromEntries(this.bonus),
        order: [...this.order],
        round: this.ileRound,
        dragonBroken: this.dragonBroken,
        spikeNeed: Object.fromEntries(this.spikeNeed),
        eruption: this.eruption,
        turn: this.turn ? { ...this.turn, roll: this.turn.roll ? { ...this.turn.roll } : null } : null,
        flash: this.flash,
      },
    };
  }

  playerRemoved(playerId: string): void {
    const wasTurn = this.turn?.playerId === playerId;
    const index = this.order.indexOf(playerId);
    this.order = this.order.filter((id) => id !== playerId);
    if (index >= 0 && index <= this.turnIndex) this.turnIndex--;
    if (wasTurn && this.stage === "ile") this.nextTurn();
    else this.host.changed();
  }

  private players(): string[] {
    return this.order.filter((id) => this.host.room.findPlayer(id));
  }

  private name(id: string): string {
    return this.host.room.findPlayer(id)?.name ?? "?";
  }

  private die(max = 6): number {
    return 1 + Math.floor(this.host.random() * max);
  }

  // ───────────── Tours ─────────────

  private nextRound(): void {
    if (this.disposed) return;
    const players = this.players();
    if (players.length < 1) return this.podium([]);
    if (this.ileRound >= MAX_ROUNDS) {
      const best = Math.max(...players.map((id) => this.pawns.get(id)!.cell));
      return this.podium(players.filter((id) => this.pawns.get(id)!.cell === best && this.pawns.get(id)!.volcano === null));
    }
    // L'éruption ne dure que jusqu'à la fin du tour.
    this.eruption = 0;
    this.ileRound++;
    this.turn = null;
    this.flash = null;
    if (!this.startMiniGame(players, "ile")) this.applyOrder([players]);
  }

  protected onMiniGameDone(ranking: string[][]): void {
    if (this.purpose === "ile1v3") return this.afterOneVsAll(ranking);
    if (this.purpose === "ileduel") return this.afterDuel(ranking);
    const changes = this.applyOrder(ranking);
    this.showResults(ranking, changes, () => this.beginTurns());
  }

  /** Ordre de passage (égalités départagées au hasard) et dés bonus. */
  private applyOrder(ranking: string[][]): RoundResult["changes"] {
    const groups = ranking.map((g) => g.filter((id) => this.pawns.has(id))).filter((g) => g.length);
    const changes: RoundResult["changes"] = [];
    for (const id of this.pawns.keys()) this.bonus.set(id, null);
    groups.forEach((g, place) => {
      const die = groups.length > 1 ? ileBonusForPlace(place, groups.length) : null;
      for (const id of g) {
        this.bonus.set(id, die);
        changes.push({ playerId: id, points: 0, ...(die ? { bonusDie: die } : {}) });
      }
    });
    const order = groups.flatMap((g) => [...g].sort(() => this.host.random() - 0.5));
    this.order = [...order, ...this.order.filter((id) => !order.includes(id))];
    if (ranking.length === 1 && !this.module) this.beginTurns();
    return changes;
  }

  private beginTurns(): void {
    this.module = null;
    this.participants = [];
    this.turnIndex = -1;
    this.nextTurn();
  }

  private nextTurn(): void {
    if (this.disposed) return;
    this.turnIndex++;
    while (this.turnIndex < this.order.length && !this.host.room.findPlayer(this.order[this.turnIndex]!)) this.turnIndex++;
    const id = this.order[this.turnIndex];
    if (!id) return this.nextRound();
    const pawn = this.pawns.get(id)!;
    const atSummit = pawn.cell === ILE_SUMMIT;
    this.turn = {
      playerId: id,
      phase: "roll",
      roll: null,
      challenge: atSummit ? { gate: ILE_GATES.length - 1, need: 6, value: null, ok: null } : null,
      choose: null,
      message: atSummit ? "est au sommet : il faut faire 6 ou plus avec ses dés pour briser la statue !" : pawn.volcano !== null ? "est dans le volcan…" : "lance les dés",
      endsAt: null,
      rollId: this.rollId,
    };
    const wait = this.isBotOrAway(id) ? ILE_TIMINGS.botThink : ILE_TIMINGS.rollTimeout;
    this.turn.endsAt = this.host.now() + wait;
    this.setStage("ile", null);
    this.goTo(wait, () => this.roll(id));
  }

  /** Dé normal + dé bonus (+ un dé de plus en cas de double). */
  private rollDice(id: string): IleRoll {
    const bonusMax = this.bonus.get(id) ?? null;
    const std = this.die();
    const bonus = bonusMax ? this.die(bonusMax) : null;
    const extra = bonus !== null && bonus === std ? this.die() : null;
    return { std, bonus, bonusMax, extra, total: std + (bonus ?? 0) + (extra ?? 0) };
  }

  private roll(id: string): void {
    const turn = this.turn;
    if (!turn || turn.playerId !== id || turn.phase !== "roll") return;
    turn.roll = this.rollDice(id);
    turn.rollId = ++this.rollId;
    turn.endsAt = null;
    const bonusName = turn.roll.bonusMax ? ` + ${ILE_BONUS_NAMES[turn.roll.bonusMax] ?? "dé bonus"}` : "";
    const pawn = this.pawns.get(id)!;
    // Au sommet : le jet sert au défi final.
    if (pawn.cell === ILE_SUMMIT) {
      const ok = turn.roll.total >= 6;
      turn.phase = "challenge";
      turn.challenge = { gate: ILE_GATES.length - 1, need: 6, value: turn.roll.total, ok };
      turn.message = ok ? `fait ${turn.roll.total} et brise la statue du sommet !` : `fait ${turn.roll.total}… pas assez, on retentera au prochain tour.`;
      this.setStage("ile", null);
      return this.goTo(ILE_TIMINGS.show + 600, () => (ok ? this.podium([id]) : this.endTurn()));
    }
    turn.phase = "move";
    turn.message = `fait ${turn.roll.total} (dé ${turn.roll.std}${bonusName}${turn.roll.bonus !== null ? ` : ${turn.roll.bonus}` : ""}${turn.roll.extra !== null ? `, double ! dé en plus : ${turn.roll.extra}` : ""})`;
    this.setStage("ile", null);
    this.goTo(ILE_TIMINGS.dice, () => (pawn.volcano !== null ? this.walkVolcano(id, turn.roll!.total) : this.walk(id, turn.roll!.total)));
  }

  // ───────────── Déplacements ─────────────

  /** Avance case par case ; s'arrête devant un défi fermé. */
  private walk(id: string, steps: number): void {
    const pawn = this.pawns.get(id)!;
    if (steps <= 0) return this.land(id);
    const g = gateAfter(pawn.cell);
    if (g >= 0 && !(ILE_GATES[g]!.kind === "dragon" && this.dragonBroken)) return this.challenge(id, g, steps);
    pawn.cell++;
    this.host.changed();
    this.goTo(ILE_TIMINGS.step, () => this.walk(id, steps - 1));
  }

  private walkVolcano(id: string, steps: number): void {
    const pawn = this.pawns.get(id)!;
    const target = Math.min(ILE_VOLCANO.length - 1, (pawn.volcano ?? 0) + steps);
    const stepOne = () => {
      if (pawn.volcano! >= target) return this.landVolcano(id);
      pawn.volcano!++;
      this.host.changed();
      this.goTo(ILE_TIMINGS.step, stepOne);
    };
    stepOne();
  }

  private landVolcano(id: string): void {
    const pawn = this.pawns.get(id)!;
    const cell = ILE_VOLCANO[pawn.volcano!]!;
    if (cell === "plus4") {
      pawn.volcano = Math.min(ILE_VOLCANO.length - 1, pawn.volcano! + 4);
      return this.effect(id, "+4 dans le volcan !", () => this.landVolcanoExitCheck(id));
    }
    this.landVolcanoExitCheck(id);
  }

  private landVolcanoExitCheck(id: string): void {
    const pawn = this.pawns.get(id)!;
    const cell = ILE_VOLCANO[pawn.volcano!]!;
    if (cell === "cri" || cell === "sortie") {
      // Retour sur l'île, à la case d'où l'on est tombé (pas plus loin).
      pawn.volcano = null;
      return this.effect(id, cell === "cri" ? "pousse un grand cri et ressort du volcan, là où il était tombé !" : "voit la lumière et ressort du volcan, là où il était tombé !", () => this.endTurn());
    }
    this.endTurn();
  }

  /** Message d'effet, puis suite. */
  private effect(id: string, text: string, then: () => void): void {
    if (!this.turn) return then();
    this.turn.phase = "effect";
    this.turn.message = text;
    this.flash = { playerId: id, text };
    this.setStage("ile", null);
    this.goTo(ILE_TIMINGS.show, then);
  }

  /** Chute dans le volcan : `cell` reste la case d'où l'on est tombé (on y revient en sortant). */
  private toVolcano(id: string): void {
    this.pawns.get(id)!.volcano = 0;
  }

  /** Arrivée sur une case (après le dé ou un saut de liane). Les effets ne s'enchaînent pas. */
  private land(id: string): void {
    const pawn = this.pawns.get(id)!;
    if (pawn.cell >= ILE_LAST_CELL && gateAfter(pawn.cell) < 0) return this.endTurn();
    const type = this.cells[pawn.cell]!;
    const erupted = this.eruption > 0 && type !== "vide" && type !== "depart";
    if (erupted) {
      const n = ILE_ERUPTION_BACK * this.eruption;
      pawn.cell = Math.max(0, pawn.cell - n);
      return this.effect(id, `subit l'éruption : recule de ${n} cases !`, () => this.endTurn());
    }
    const back = (n: number) => (pawn.cell = Math.max(0, pawn.cell - n));
    const forward = (n: number) => (pawn.cell = clampForward(pawn.cell, pawn.cell + n, this.dragonBroken));
    const done = () => this.endTurn();
    switch (type) {
      case "plus4":
      case "plus5":
      case "plus6": {
        const n = Number(type.slice(4));
        forward(n);
        return this.effect(id, `avance de ${n} cases !`, done);
      }
      case "moins4":
        back(4);
        return this.effect(id, "recule de 4 cases…", done);
      case "statue-bleue": {
        const n = 16 + Math.floor(this.host.random() * 3);
        forward(n);
        return this.effect(id, `est propulsé par la statue bleue (${n} cases) !`, done);
      }
      case "statue-rouge":
        back(18);
        return this.effect(id, "est renvoyé 18 cases en arrière par la statue rouge !", done);
      case "dino": {
        if (this.host.random() < 0.5) {
          forward(10);
          return this.effect(id, "s'envole avec le ptérodactyle : 10 cases en avant !", done);
        }
        const n = 4 + Math.floor(this.host.random() * 6);
        back(n);
        return this.effect(id, `fuit le T-rex et recule de ${n} cases !`, done);
      }
      case "tornade": {
        const targets = this.players().filter((o) => o !== id && this.pawns.get(o)!.volcano === null && this.pawns.get(o)!.cell > 0 && this.pawns.get(o)!.cell < ILE_SUMMIT);
        if (!targets.length) return this.effect(id, "lance la tornade… mais personne n'est touché.", done);
        const victim = targets[Math.floor(this.host.random() * targets.length)]!;
        const n = 4 + Math.floor(this.host.random() * 3);
        const vp = this.pawns.get(victim)!;
        vp.cell = Math.max(0, vp.cell - n);
        return this.effect(id, `déclenche une tornade : ${this.name(victim)} recule de ${n} cases !`, done);
      }
      case "ovni": {
        const targets = this.players().filter((o) => o !== id && this.pawns.get(o)!.volcano === null && this.pawns.get(o)!.cell !== pawn.cell && this.pawns.get(o)!.cell < ILE_SUMMIT);
        if (!targets.length) return this.effect(id, "voit passer un OVNI… qui repart sans personne.", done);
        const other = targets[Math.floor(this.host.random() * targets.length)]!;
        const op = this.pawns.get(other)!;
        [pawn.cell, op.cell] = [op.cell, pawn.cell];
        return this.effect(id, `est échangé avec ${this.name(other)} par l'OVNI !`, done);
      }
      case "eruption":
        this.eruption++;
        return this.effect(
          id,
          this.eruption > 1
            ? `réveille encore le volcan : les éruptions se cumulent ! Jusqu'à la fin du tour, les cases spéciales font reculer de ${ILE_ERUPTION_BACK * this.eruption}.`
            : `réveille le volcan : éruption ! Jusqu'à la fin du tour, toutes les cases spéciales font reculer de ${ILE_ERUPTION_BACK}.`,
          done,
        );
      case "crane":
        this.toVolcano(id);
        return this.effect(id, "tombe sur le crâne… direction le volcan !", done);
      case "unvstous": {
        const others = this.players().filter((o) => o !== id);
        if (!others.length) return done();
        return this.effect(id, "lance un mini-jeu seul contre tous : +10 cases s'il gagne !", () => {
          if (!this.startMiniGame([id, ...others], "ile1v3")) done();
        });
      }
      case "duel":
        return this.askDuel(id);
      default:
        return done();
    }
  }

  // ───────────── Défis ─────────────

  private challenge(id: string, gate: number, steps: number): void {
    const turn = this.turn!;
    const pawn = this.pawns.get(id)!;
    const kind = ILE_GATES[gate]!.kind;
    if (kind === "caisses") {
      this.remainingSteps = steps;
      turn.phase = "choose";
      turn.choose = { kind: "chemin", options: ["Les caisses", "Les tonneaux"] };
      turn.message = "choisit son chemin sur la cascade : les caisses ou les tonneaux ?";
      const bot = this.isBotOrAway(id);
      const wait = bot ? ILE_TIMINGS.botThink : ILE_TIMINGS.choiceTimeout;
      turn.endsAt = this.host.now() + wait;
      this.setStage("ile", null);
      return this.goTo(wait, () => this.crossFalls(id, Math.floor(this.host.random() * 2), steps));
    }
    if (kind === "final") pawn.cell = ILE_SUMMIT;
    // Les autres défis se jouent avec un nouveau lancer, d'un seul dé.
    const need = kind === "dragon" ? 4 : kind === "volcan" ? 3 : kind === "boule" ? (this.spikeNeed.get(id) ?? 5) : kind === "final" ? 6 : null;
    turn.phase = "gate";
    turn.roll = null;
    turn.challenge = { gate, need, value: null, ok: null };
    turn.message =
      kind === "liane"
        ? "attrape la liane : lance le dé pour savoir jusqu'où il saute !"
        : kind === "final"
          ? "arrive au sommet ! Lance le dé : un 6 brise la statue et fait gagner !"
          : `est devant « ${ILE_GATES[gate]!.label} » : lance le dé, il faut ${need} ou plus !`;
    const wait = this.isBotOrAway(id) ? ILE_TIMINGS.botThink : ILE_TIMINGS.rollTimeout;
    turn.endsAt = this.host.now() + wait;
    this.pendingGate = { gate, steps };
    this.setStage("ile", null);
    this.goTo(wait, () => this.gateRoll(id));
  }

  /** Lancer du dé de défi, puis résultat après l'animation. */
  private gateRoll(id: string): void {
    const turn = this.turn;
    const pending = this.pendingGate;
    if (!turn || turn.playerId !== id || turn.phase !== "gate" || !pending || !turn.challenge) return;
    this.pendingGate = null;
    const value = this.die();
    turn.rollId = ++this.rollId;
    turn.challenge.value = value;
    turn.phase = "challenge";
    turn.endsAt = null;
    turn.message = "lance le dé…";
    this.setStage("ile", null);
    this.goTo(ILE_TIMINGS.gateDice, () => this.resolveGate(id, pending.gate, pending.steps, value));
  }

  private resolveGate(id: string, gate: number, steps: number, value: number): void {
    const turn = this.turn!;
    const pawn = this.pawns.get(id)!;
    const kind = ILE_GATES[gate]!.kind;
    const show = (then: () => void) => {
      this.setStage("ile", null);
      this.goTo(ILE_TIMINGS.show + 300, then);
    };
    switch (kind) {
      case "liane": {
        turn.challenge = { gate, need: null, value, ok: true };
        turn.message = `s'élance à la liane : saut de ${value} case${value > 1 ? "s" : ""} !`;
        return show(() => {
          pawn.cell = Math.min(ILE_LAST_CELL, pawn.cell + value);
          this.host.changed();
          this.goTo(ILE_TIMINGS.step * 2, () => this.land(id));
        });
      }
      case "dragon": {
        const ok = value >= 4;
        turn.challenge = { gate, need: 4, value, ok };
        turn.message = ok ? `fait ${value} et brise le mur du dragon ! Le passage est ouvert.` : `fait ${value}… le dragon crache du feu : recule de 3 cases !`;
        if (ok) this.dragonBroken = true;
        return show(() => {
          if (ok) return this.continueAfter(id, steps);
          pawn.cell = Math.max(0, pawn.cell - 3);
          this.endTurn();
        });
      }
      case "volcan": {
        const ok = value >= 3;
        turn.challenge = { gate, need: 3, value, ok };
        turn.message = ok ? `fait ${value} et passe à côté du volcan !` : `fait ${value}… et tombe dans le volcan !`;
        return show(() => {
          if (ok) return this.continueAfter(id, steps);
          this.toVolcano(id);
          this.endTurn();
        });
      }
      case "boule": {
        const need = this.spikeNeed.get(id) ?? 5;
        const ok = value >= need;
        turn.challenge = { gate, need, value, ok };
        if (ok) {
          turn.message = `fait ${value} : la boule à pointes est évitée !`;
          return show(() => this.continueAfter(id, steps));
        }
        this.spikeNeed.set(id, Math.max(2, need - 1));
        const g4 = ILE_GATES.find((g) => g.kind === "volcan")!.after;
        const hit = this.players().filter((o) => {
          const p = this.pawns.get(o)!;
          return p.volcano === null && p.cell > g4 && p.cell <= ILE_GATES[gate]!.after;
        });
        turn.message = `fait ${value} (il fallait ${need})… la boule dévale ! ${hit.map((o) => this.name(o)).join(", ")} recule${hit.length > 1 ? "nt" : ""} de ${ILE_SPIKE_BACK} cases.`;
        return show(() => {
          for (const o of hit) {
            const p = this.pawns.get(o)!;
            p.cell = Math.max(0, p.cell - ILE_SPIKE_BACK);
          }
          this.endTurn();
        });
      }
      case "final": {
        const ok = value >= 6;
        turn.challenge = { gate, need: 6, value, ok };
        turn.message = ok ? "fait 6 et brise la statue du sommet !" : `fait ${value}… pas de 6. Au prochain tour, il faudra 6 ou plus avec ses dés (dé bonus compris).`;
        return show(() => (ok ? this.podium([id]) : this.endTurn()));
      }
      default:
        return this.endTurn();
    }
  }

  private crossFalls(id: string, choice: number, steps: number): void {
    const turn = this.turn;
    if (!turn || turn.playerId !== id || turn.choose?.kind !== "chemin") return;
    const broken = Math.floor(this.host.random() * 2);
    const ok = choice !== broken;
    turn.choose = null;
    turn.endsAt = null;
    turn.phase = "challenge";
    turn.challenge = { gate: gateAfter(this.pawns.get(id)!.cell), need: null, value: null, ok, choice, broken };
    turn.message = ok ? `traverse sur ${choice ? "les tonneaux" : "les caisses"} sans encombre !` : `voit ${choice ? "les tonneaux" : "les caisses"} céder… il traverse à la nage et s'arrête là.`;
    this.setStage("ile", null);
    this.goTo(ILE_TIMINGS.show + 300, () => {
      const pawn = this.pawns.get(id)!;
      if (ok) return this.continueAfter(id, steps);
      pawn.cell++;
      this.endTurn();
    });
  }

  /** Défi réussi : on le franchit et on finit son déplacement. */
  private continueAfter(id: string, steps: number): void {
    const pawn = this.pawns.get(id)!;
    pawn.cell++;
    if (this.turn) this.turn.phase = "move";
    this.host.changed();
    this.goTo(ILE_TIMINGS.step, () => this.walk(id, steps - 1));
  }

  // ───────────── Mini-jeux des cases ─────────────

  private afterOneVsAll(ranking: string[][]): void {
    const solo = this.turn?.playerId;
    const flat = ranking.map((g) => g.filter((id) => this.pawns.has(id))).filter((g) => g.length);
    const place = (id: string) => flat.findIndex((g) => g.includes(id));
    const others = this.participants.filter((id) => id !== solo);
    const avg = others.reduce((s, id) => s + place(id), 0) / Math.max(1, others.length);
    const won = solo !== undefined && place(solo) >= 0 && place(solo) < avg;
    const changes: RoundResult["changes"] = solo ? [{ playerId: solo, points: won ? 10 : 0 }] : [];
    this.showResults(ranking, changes, () => {
      this.module = null;
      this.participants = [];
      if (!solo || !this.turn) return this.endTurn();
      const pawn = this.pawns.get(solo)!;
      if (won) pawn.cell = clampForward(pawn.cell, pawn.cell + 10, this.dragonBroken);
      this.setStage("ile", null);
      this.effect(solo, won ? "gagne seul contre tous : 10 cases en avant !" : "perd contre les autres… rien ne bouge.", () => this.endTurn());
    });
  }

  private askDuel(id: string): void {
    const turn = this.turn!;
    const options = this.players().filter((o) => o !== id && this.pawns.get(o)!.volcano === null && this.pawns.get(o)!.cell < ILE_SUMMIT);
    if (!options.length) return this.effect(id, "cherche un adversaire pour un duel… personne n'est disponible.", () => this.endTurn());
    turn.phase = "choose";
    turn.choose = { kind: "duel", options };
    turn.message = "choisit son adversaire pour un duel : le gagnant avance de 7, le perdant recule de 7.";
    const bot = this.isBotOrAway(id);
    const wait = bot ? ILE_TIMINGS.botThink : ILE_TIMINGS.choiceTimeout;
    turn.endsAt = this.host.now() + wait;
    this.setStage("ile", null);
    // Un bot défie celui qui est le plus haut.
    const best = [...options].sort((a, b) => this.pawns.get(b)!.cell - this.pawns.get(a)!.cell)[0]!;
    this.goTo(wait, () => this.startDuel(id, best));
  }

  private startDuel(id: string, target: string): void {
    const turn = this.turn;
    if (!turn || turn.playerId !== id || turn.choose?.kind !== "duel") return;
    turn.choose = null;
    turn.endsAt = null;
    this.duelTarget = target;
    if (!this.startMiniGame([id, target], "ileduel")) this.endTurn();
  }

  private afterDuel(ranking: string[][]): void {
    const solo = this.turn?.playerId;
    const target = this.duelTarget;
    this.duelTarget = null;
    const first = ranking[0] ?? [];
    const won = !!solo && !!target && first.includes(solo) && !first.includes(target);
    const changes: RoundResult["changes"] = won ? [{ playerId: solo!, points: 7 }, { playerId: target!, points: -7 }] : [];
    this.showResults(ranking, changes, () => {
      this.module = null;
      this.participants = [];
      if (!solo || !target || !this.turn) return this.endTurn();
      if (won) {
        const sp = this.pawns.get(solo)!;
        const tp = this.pawns.get(target)!;
        sp.cell = clampForward(sp.cell, sp.cell + 7, this.dragonBroken);
        if (tp.cell < ILE_SUMMIT) tp.cell = Math.max(0, tp.cell - 7);
      }
      this.setStage("ile", null);
      this.effect(solo, won ? `gagne le duel : +7 cases, ${this.name(target)} recule de 7 !` : "ne gagne pas le duel… rien ne bouge.", () => this.endTurn());
    });
  }

  private endTurn(): void {
    if (this.disposed) return;
    if (this.turn) {
      this.turn.phase = "done";
      this.turn.choose = null;
      this.turn.endsAt = null;
    }
    this.setStage("ile", null);
    this.goTo(500, () => this.nextTurn());
  }

  // ───────────── Actions des joueurs ─────────────

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; option?: unknown; target?: unknown } | null;
    const turn = this.turn;
    if (this.stage !== "ile" || !turn || turn.playerId !== playerId) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type === "roll") {
      if (turn.phase === "gate") return this.gateRoll(playerId);
      if (turn.phase !== "roll") throw new RoomError(ERRORS.notYourTurn);
      return this.roll(playerId);
    }
    if (action?.type === "path") {
      if (turn.choose?.kind !== "chemin" || (action.option !== 0 && action.option !== 1)) throw new RoomError(ERRORS.badRequest);
      return this.crossFalls(playerId, action.option, this.remainingSteps ?? 1);
    }
    if (action?.type === "duel") {
      if (turn.choose?.kind !== "duel" || typeof action.target !== "string" || !turn.choose.options.includes(action.target)) throw new RoomError(ERRORS.badRequest);
      return this.startDuel(playerId, action.target);
    }
    throw new RoomError(ERRORS.badRequest);
  }

}

export const ileMode: GameModeModule = { id: "ile", create: (host) => new IleGame(host) };
