/**
 * Registre des modes de jeu.
 * Un mode décrit le déroulé d'une partie (Survie : enchaînement de mini-jeux ; Plateau : la course).
 * Un mode absent de ce registre est affiché « bientôt disponible » et ne peut pas être lancé.
 */
import type { GameModeId } from "@rzparty/shared";
import type { GameModeModule } from "../game/types.ts";
import { survieMode } from "../game/modes/survie.ts";
import { plateauMode } from "../game/modes/plateau.ts";
import { roueMode } from "../game/modes/roue.ts";
import { lotoMode } from "../game/modes/loto.ts";
import { quizMode } from "../game/modes/quiz.ts";
import { motsMode } from "../game/modes/mots.ts";

const modes = new Map<GameModeId, GameModeModule>();

export function registerMode(mode: GameModeModule): void {
  modes.set(mode.id, mode);
}

export function availableModes(): GameModeId[] {
  return [...modes.keys()];
}

export function getMode(id: GameModeId): GameModeModule | undefined {
  return modes.get(id);
}

// Modes disponibles.
registerMode(survieMode);
registerMode(plateauMode);
registerMode(roueMode);
registerMode(lotoMode);
registerMode(quizMode);
registerMode(motsMode);
