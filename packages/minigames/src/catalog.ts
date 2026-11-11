/**
 * Fiches des mini-jeux, sans leur logique : utilisables partout (statistiques, aide, interface).
 * Ajouter ici la fiche de chaque nouveau mini-jeu.
 */
import type { MiniGameDefinition } from "./contract.ts";
import { definition as reflexes } from "./reflexes/definition.ts";
import { definition as calcul } from "./calcul/definition.ts";
import { definition as memoire } from "./memoire/definition.ts";
import { definition as piratage } from "./piratage/definition.ts";
import { definition as labyrinthe } from "./labyrinthe/definition.ts";
import { definition as bombe } from "./bombe/definition.ts";
import { definition as taupes } from "./taupes/definition.ts";
import { definition as stroop } from "./stroop/definition.ts";
import { definition as coupdoeil } from "./coupdoeil/definition.ts";
import { definition as tri } from "./tri/definition.ts";
import { definition as escalier } from "./escalier/definition.ts";
import { definition as chrono } from "./chrono/definition.ts";
import { definition as vaetvient } from "./vaetvient/definition.ts";
import { definition as bandits } from "./bandits/definition.ts";
import { definition as paires } from "./paires/definition.ts";
import { definition as visage } from "./visage/definition.ts";
import { definition as tremplin } from "./tremplin/definition.ts";
import { definition as artifice } from "./artifice/definition.ts";
import { definition as escargots } from "./escargots/definition.ts";
import { definition as liane } from "./liane/definition.ts";
import { definition as pas } from "./pas/definition.ts";
import { definition as photo } from "./photo/definition.ts";
import { definition as zappeur } from "./zappeur/definition.ts";
import { definition as penalty } from "./penalty/definition.ts";
import { definition as alunissage } from "./alunissage/definition.ts";
import { definition as ballons } from "./ballons/definition.ts";
import { definition as ressort } from "./ressort/definition.ts";
import { definition as puzzle } from "./puzzle/definition.ts";
import { definition as haies } from "./haies/definition.ts";
import { definition as aiguillages } from "./aiguillages/definition.ts";
import { definition as perles } from "./perles/definition.ts";
import { definition as cadeaux } from "./cadeaux/definition.ts";

export const MINI_GAME_DEFINITIONS: MiniGameDefinition[] = [reflexes, calcul, memoire, piratage, labyrinthe, bombe, taupes, stroop, coupdoeil, tri, escalier, chrono, vaetvient, bandits, paires, visage, tremplin, liane, pas, photo, zappeur, penalty, alunissage, ballons, ressort, puzzle, haies, aiguillages, perles, cadeaux, artifice, escargots];

export type { MiniGameDefinition, MiniGameRecord } from "./contract.ts";
