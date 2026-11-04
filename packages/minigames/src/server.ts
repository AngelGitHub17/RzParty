/**
 * Registre serveur des mini-jeux.
 * Pour ajouter un mini-jeu : créer son dossier, puis l'importer et l'ajouter à la liste ci-dessous.
 */
import type { MiniGameServerModule } from "./contract.ts";
import reflexes from "./reflexes/server.ts";
import calcul from "./calcul/server.ts";
import memoire from "./memoire/server.ts";
import piratage from "./piratage/server.ts";
import labyrinthe from "./labyrinthe/server.ts";
import bombe from "./bombe/server.ts";
import taupes from "./taupes/server.ts";
import stroop from "./stroop/server.ts";
import coupdoeil from "./coupdoeil/server.ts";
import tri from "./tri/server.ts";
import escalier from "./escalier/server.ts";
import chrono from "./chrono/server.ts";
import vaetvient from "./vaetvient/server.ts";
import bandits from "./bandits/server.ts";
import paires from "./paires/server.ts";
import visage from "./visage/server.ts";
import tremplin from "./tremplin/server.ts";
import liane from "./liane/server.ts";
import pas from "./pas/server.ts";
import photo from "./photo/server.ts";
import zappeur from "./zappeur/server.ts";
import penalty from "./penalty/server.ts";
import alunissage from "./alunissage/server.ts";
import ballons from "./ballons/server.ts";
import ressort from "./ressort/server.ts";
import puzzle from "./puzzle/server.ts";
import haies from "./haies/server.ts";
import aiguillages from "./aiguillages/server.ts";
import perles from "./perles/server.ts";
import cadeaux from "./cadeaux/server.ts";

export const MINI_GAMES: MiniGameServerModule[] = [
  reflexes as MiniGameServerModule,
  calcul as MiniGameServerModule,
  memoire as MiniGameServerModule,
  piratage as MiniGameServerModule,
  labyrinthe as MiniGameServerModule,
  bombe as MiniGameServerModule,
  taupes as MiniGameServerModule,
  stroop as MiniGameServerModule,
  coupdoeil as MiniGameServerModule,
  tri as MiniGameServerModule,
  escalier as MiniGameServerModule,
  chrono as MiniGameServerModule,
  vaetvient as MiniGameServerModule,
  bandits as MiniGameServerModule,
  paires as MiniGameServerModule,
  visage as MiniGameServerModule,
  tremplin as MiniGameServerModule,
  liane as MiniGameServerModule,
  pas as MiniGameServerModule,
  photo as MiniGameServerModule,
  zappeur as MiniGameServerModule,
  penalty as MiniGameServerModule,
  alunissage as MiniGameServerModule,
  ballons as MiniGameServerModule,
  ressort as MiniGameServerModule,
  puzzle as MiniGameServerModule,
  haies as MiniGameServerModule,
  aiguillages as MiniGameServerModule,
  perles as MiniGameServerModule,
  cadeaux as MiniGameServerModule,
];

export function getMiniGame(id: string): MiniGameServerModule | undefined {
  return MINI_GAMES.find((m) => m.definition.id === id);
}

export * from "./contract.ts";
