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
import { voyageMode } from "../game/modes/voyage.ts";
import { triosMode } from "../game/modes/trios.ts";
import { bateauMode } from "../game/modes/bateau.ts";
import { pairesMode } from "../game/modes/paires.ts";
import { amitieMode } from "../game/modes/amitie.ts";
import { ileMode } from "../game/modes/ile.ts";
import { crisMode } from "../game/modes/cris.ts";
import { cacheMode } from "../game/modes/cache.ts";
import { tictacMode } from "../game/modes/tictac.ts";
import { intrusMode } from "../game/modes/intrus.ts";
import { libreMode } from "../game/modes/libre.ts";
import { batailleMode } from "../game/modes/bataille.ts";
import { soloMode } from "../game/modes/solo.ts";
import { defisMode } from "../game/modes/defis.ts";

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
registerMode(voyageMode);
registerMode(triosMode);
registerMode(bateauMode);
registerMode(pairesMode);
registerMode(amitieMode);
registerMode(ileMode);
registerMode(crisMode);
registerMode(cacheMode);
registerMode(tictacMode);
registerMode(intrusMode);
registerMode(libreMode);
registerMode(batailleMode);
registerMode(soloMode);
registerMode(defisMode);
