import {
  BOAT_COLORS,
  BOAT_LIMIT,
  BOAT_PLACES,
  BOAT_YARDS,
  ERRORS,
  boatFreeSlots,
  boatTorque,
  coloredAvatar,
  type BoatSailor,
  type GameSnapshot,
  type RoundResult,
  type Standing,
} from "@rzparty/shared";
import { RoomError } from "../../rooms/RoomManager.ts";
import { BaseGame } from "../BaseGame.ts";
import type { GameHost, GameModeModule } from "../types.ts";

export const BATEAU_TIMINGS = {
  intro: 2500,
  /** Temps pour poser son personnage. */
  place: 20_000,
  botThink: 1500,
  afterPlace: 1300,
  /** Coup de vent annoncé avant le mini-jeu suivant. */
  gust: 2200,
  end: 4500,
};

/** Coup de vent maximal (en penchant). */
const MAX_GUST = 1.5;

/**
 * Mode « Bateau d'équilibre » (coopératif) : tous les joueurs forment un équipage.
 * À chaque tour, un mini-jeu donne à chacun un personnage à embarquer : petit pour les premiers,
 * moyen au milieu, gros pour les derniers. Chacun le pose sur la vergue de sa couleur, à gauche
 * ou à droite du mât. Plus on le pose loin et haut, plus le bateau penche. Entre deux tours,
 * un coup de vent peut le faire pencher un peu. Objectif : embarquer tout le monde sans chavirer.
 */
export class BateauGame extends BaseGame {
  protected readonly mode = "bateau" as const;
  private sailors: (BoatSailor & { slot: number; by: string })[] = [];
  private queue: { playerId: string; sailor: BoatSailor }[] = [];
  private yards: number[];
  private drift = 0;
  private gust = 0;
  private boatPhase: "place" | "sunk" | "won" = "place";
  private boatRound = 0;
  private endsAt: number | null = null;
  private placed = new Map<string, number>();

  constructor(host: GameHost) {
    super(host);
    for (const p of host.room.players) this.placed.set(p.id, 0);
    // La couleur (donc la vergue) de chaque personnage à embarquer, sans jamais dépasser 8 par vergue.
    const goal = this.goal();
    this.yards = Array.from({ length: goal }, (_, i) => i % BOAT_YARDS).sort(() => host.random() - 0.5);
  }

  private goal(): number {
    return this.host.room.settings.bateau.goal;
  }

  private tilt(): number {
    return this.drift + this.sailors.reduce((sum, s) => sum + boatTorque(s), 0);
  }

  start(): void {
    this.setStage("bateau", BATEAU_TIMINGS.intro);
    this.goTo(BATEAU_TIMINGS.intro, () => this.nextRound());
  }

  protected standings(): Standing[] {
    return [...this.placed].map(([playerId, score]) => ({ playerId, lives: 0, score, eliminated: !this.host.room.findPlayer(playerId) }));
  }

  protected extraSnapshot(): Partial<GameSnapshot> {
    return {
      bateau: {
        goal: this.goal(),
        sailors: this.sailors.map((s) => ({ ...s })),
        tilt: Math.round(this.tilt() * 100) / 100,
        drift: Math.round(this.drift * 100) / 100,
        gust: Math.round(this.gust * 100) / 100,
        queue: this.queue.map((q) => ({ playerId: q.playerId, sailor: { ...q.sailor } })),
        turn: this.turn(),
        phase: this.boatPhase,
        round: this.boatRound,
        endsAt: this.endsAt,
      },
    };
  }

  playerRemoved(playerId: string): void {
    const wasTurn = this.turn() === playerId;
    this.queue = this.queue.filter((q) => q.playerId !== playerId);
    if (wasTurn) this.nextPlacement();
    else this.host.changed();
  }

  private players(): string[] {
    return [...this.placed.keys()].filter((id) => this.host.room.findPlayer(id));
  }

  private turn(): string | null {
    return this.stage === "bateau" && this.boatPhase === "place" ? (this.queue[0]?.playerId ?? null) : null;
  }

  private nextRound(): void {
    if (this.disposed) return;
    if (!this.players().length) return this.podium([]);
    this.boatRound++;
    this.gust = 0;
    if (!this.startMiniGame(this.players(), "bateau")) this.onMiniGameDone([this.players()]);
  }

  /** Les premiers reçoivent un petit personnage, les derniers un gros. */
  protected onMiniGameDone(ranking: string[][]): void {
    const groups = ranking.map((g) => g.filter((id) => this.placed.has(id))).filter((g) => g.length);
    const changes: RoundResult["changes"] = [];
    this.queue = [];
    groups.forEach((group, i) => {
      // 1er : petit ; dernier : gros (moyen s'il n'y a que deux groupes) ; entre les deux : moyen.
      const size = i === 0 ? 1 : i === groups.length - 1 && groups.length >= 3 ? 3 : 2;
      for (const id of group) {
        const yard = this.yards[this.sailors.length + this.queue.length];
        if (yard === undefined) continue;
        this.queue.push({ playerId: id, sailor: { avatar: coloredAvatar(this.host.random, BOAT_COLORS[yard]!), yard, size } });
        changes.push({ playerId: id, points: size });
      }
    });
    this.showResults(ranking, changes, () => {
      this.module = null;
      this.participants = [];
      this.nextPlacement();
    });
  }

  private nextPlacement(): void {
    if (this.disposed) return;
    while (this.queue[0] && !this.host.room.findPlayer(this.queue[0].playerId)) this.queue.shift();
    const next = this.queue[0];
    if (!next) return this.windThenNext();
    const wait = this.isBotOrAway(next.playerId) ? BATEAU_TIMINGS.botThink : BATEAU_TIMINGS.place;
    this.endsAt = this.host.now() + wait;
    this.setStage("bateau", null);
    this.goTo(wait, () => this.place(next.playerId, this.bestSlot(next.sailor)));
  }

  private place(playerId: string, slot: number): void {
    const q = this.queue[0];
    if (!q || q.playerId !== playerId) return;
    this.queue.shift();
    this.sailors.push({ ...q.sailor, slot, by: playerId });
    this.placed.set(playerId, (this.placed.get(playerId) ?? 0) + 1);
    this.endsAt = null;
    if (Math.abs(this.tilt()) > BOAT_LIMIT) return this.end("sunk");
    if (this.sailors.length >= this.goal()) return this.end("won");
    this.setStage("bateau", null);
    this.goTo(BATEAU_TIMINGS.afterPlace, () => this.nextPlacement());
  }

  /** Entre deux tours : un coup de vent fait un peu pencher le bateau. */
  private windThenNext(): void {
    this.queue = [];
    this.gust = Math.round((this.host.random() * 2 - 1) * MAX_GUST * 10) / 10;
    this.drift += this.gust;
    this.endsAt = null;
    if (Math.abs(this.tilt()) > BOAT_LIMIT) return this.end("sunk");
    this.setStage("bateau", BATEAU_TIMINGS.gust);
    this.goTo(BATEAU_TIMINGS.gust, () => this.nextRound());
  }

  private end(result: "sunk" | "won"): void {
    this.boatPhase = result;
    this.queue = [];
    this.endsAt = null;
    this.setStage("bateau", BATEAU_TIMINGS.end);
    this.goTo(BATEAU_TIMINGS.end, () => this.podium(result === "won" ? this.players() : []));
  }

  /** La place qui garde le bateau le plus droit (un bot distrait se trompe parfois). */
  private bestSlot(sailor: BoatSailor): number {
    const free = boatFreeSlots(this.sailors, sailor.yard);
    const slots = free.length ? free : [...BOAT_PLACES];
    const tilt = this.tilt();
    const after = (slot: number) => Math.abs(tilt + boatTorque({ ...sailor, slot }));
    const q = this.queue[0];
    const p = q ? this.host.room.findPlayer(q.playerId) : undefined;
    if (p?.isBot && p.botPersonality === "glitch" && this.host.random() < 0.25) return slots[Math.floor(this.host.random() * slots.length)]!;
    return [...slots].sort((a, b) => after(a) - after(b) || Math.abs(a) - Math.abs(b))[0]!;
  }

  action(playerId: string, raw: unknown): void {
    const action = raw as { type?: unknown; slot?: unknown } | null;
    if (this.turn() !== playerId) throw new RoomError(ERRORS.notYourTurn);
    if (action?.type !== "place" || typeof action.slot !== "number") throw new RoomError(ERRORS.badRequest);
    const sailor = this.queue[0]!.sailor;
    if (!boatFreeSlots(this.sailors, sailor.yard).includes(action.slot)) throw new RoomError("Cette place est prise.");
    this.place(playerId, action.slot);
  }
}

export const bateauMode: GameModeModule = { id: "bateau", create: (host) => new BateauGame(host) };
