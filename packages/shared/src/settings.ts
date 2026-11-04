import { SURVIVAL_LIVES_CHOICES, SURVIVAL_SCORE_CHOICES, BOT_PERSONALITIES, DIFFICULTIES, GAME_MODES } from "./catalog.ts";
import type { BotPersonality, RoomSettings } from "./types.ts";
import { BOARD_SIZES } from "./board.ts";
import { TEAM_CHOICES } from "./constants.ts";
import { WHEEL_ROUND_CHOICES } from "./wheel.ts";
import { QUIZ_ROUND_CHOICES, WORD_BOMB_CHOICES } from "./partyModes.ts";
import { defaultCustomConfig, patchConfig } from "./boardConfig.ts";

export function defaultSettings(): RoomSettings {
  return {
    mode: "survie",
    botDifficulty: "moyen",
    teams: 0,
    wheel: { rounds: 10 },
    quiz: { rounds: 8 },
    mots: { bombs: 5 },
    miniGames: [],
    board: { size: "moyen", custom: defaultCustomConfig() },
    survival: { rule: "vies", lives: 3, targetScore: 10 },
  };
}

/** Modifications de réglages acceptées depuis le client (tout est optionnel). */
export interface SettingsPatch {
  mode?: string;
  botDifficulty?: string;
  survival?: { rule?: string; lives?: number; targetScore?: number };
  board?: { size?: string; custom?: unknown };
  teams?: number;
  miniGames?: unknown;
  wheel?: { rounds?: number };
  quiz?: { rounds?: number };
  mots?: { bombs?: number };
}

/**
 * Applique un patch venu du réseau en ignorant toute valeur invalide.
 * Ne fait jamais confiance au client : seules les valeurs connues passent.
 */
export function applySettingsPatch(current: RoomSettings, patch: unknown): RoomSettings {
  const next: RoomSettings = structuredClone(current);
  if (!patch || typeof patch !== "object") return next;
  const p = patch as SettingsPatch;

  if (typeof p.mode === "string" && p.mode in GAME_MODES) next.mode = p.mode as RoomSettings["mode"];
  if (typeof p.botDifficulty === "string" && p.botDifficulty in DIFFICULTIES) {
    next.botDifficulty = p.botDifficulty as RoomSettings["botDifficulty"];
  }
  if (p.survival && typeof p.survival === "object") {
    const s = p.survival;
    if (s.rule === "vies" || s.rule === "score") next.survival.rule = s.rule;
    if ((SURVIVAL_LIVES_CHOICES as readonly number[]).includes(s.lives as number)) next.survival.lives = s.lives as number;
    if ((SURVIVAL_SCORE_CHOICES as readonly number[]).includes(s.targetScore as number)) {
      next.survival.targetScore = s.targetScore as number;
    }
  }
  if (p.wheel && (WHEEL_ROUND_CHOICES as readonly number[]).includes(p.wheel.rounds as number)) next.wheel.rounds = p.wheel.rounds as number;
  if (p.quiz && (QUIZ_ROUND_CHOICES as readonly number[]).includes(p.quiz.rounds as number)) next.quiz.rounds = p.quiz.rounds as number;
  if (p.mots && (WORD_BOMB_CHOICES as readonly number[]).includes(p.mots.bombs as number)) next.mots.bombs = p.mots.bombs as number;
  if (Array.isArray(p.miniGames)) {
    // Les identifiants inconnus sont ignorés par le serveur au moment du tirage.
    next.miniGames = [...new Set(p.miniGames.filter((id): id is string => typeof id === "string" && /^[a-z0-9-]{1,32}$/.test(id)))].slice(0, 100);
  }
  if ((TEAM_CHOICES as readonly number[]).includes(p.teams as number)) next.teams = p.teams as number;
  if (p.board && typeof p.board === "object") {
    if (typeof p.board.size === "string" && p.board.size in BOARD_SIZES) next.board.size = p.board.size as RoomSettings["board"]["size"];
    if (p.board.custom !== undefined) next.board.custom = patchConfig(next.board.custom, p.board.custom);
  }
  return next;
}

export function isBotPersonality(value: unknown): value is BotPersonality {
  return typeof value === "string" && value in BOT_PERSONALITIES;
}
