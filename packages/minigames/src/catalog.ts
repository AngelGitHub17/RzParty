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
import { definition as liane } from "./liane/definition.ts";
import { definition as pas } from "./pas/definition.ts";
import { definition as photo } from "./photo/definition.ts";

export const MINI_GAME_DEFINITIONS: MiniGameDefinition[] = [reflexes, calcul, memoire, piratage, labyrinthe, bombe, taupes, stroop, coupdoeil, tri, escalier, chrono, vaetvient, bandits, paires, visage, tremplin, liane, pas, photo];

export type { MiniGameDefinition, MiniGameRecord } from "./contract.ts";
