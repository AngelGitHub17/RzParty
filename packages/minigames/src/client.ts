/**
 * Registre navigateur des mini-jeux : associe chaque identifiant à sa vue.
 * Une vue s'adapte à trois dispositions :
 *   - `tv`   : écran commun (aucune saisie, lisible de loin) ;
 *   - `pad`  : téléphone-manette (saisie, informations privées, l'action se regarde sur la télé) ;
 *   - `solo` : écran individuel (tout sur le même écran).
 */
import { reflexesView } from "./reflexes/view.ts";
import { calculView } from "./calcul/view.ts";
import { memoireView } from "./memoire/view.ts";
import { piratageView } from "./piratage/view.ts";
import { labyrintheView } from "./labyrinthe/view.ts";
import { bombeView } from "./bombe/view.ts";
import { taupesView } from "./taupes/view.ts";
import { stroopView } from "./stroop/view.ts";
import { coupdoeilView } from "./coupdoeil/view.ts";
import { triView } from "./tri/view.ts";
import { escalierView } from "./escalier/view.ts";
import { chronoView } from "./chrono/view.ts";
import { vaetvientView } from "./vaetvient/view.ts";
import { banditsView } from "./bandits/view.ts";
import { pairesView } from "./paires/view.ts";
import { visageView } from "./visage/view.ts";
import { tremplinView } from "./tremplin/view.ts";
import { lianeView } from "./liane/view.ts";
import { pasView } from "./pas/view.ts";
import { photoView } from "./photo/view.ts";
import { zappeurView } from "./zappeur/view.ts";
import { penaltyView } from "./penalty/view.ts";
import { alunissageView } from "./alunissage/view.ts";
import { ballonsView } from "./ballons/view.ts";
import { ressortView } from "./ressort/view.ts";
import { puzzleView } from "./puzzle/view.ts";
import { haiesView } from "./haies/view.ts";
import { aiguillagesView } from "./aiguillages/view.ts";
import { perlesView } from "./perles/view.ts";
import { cadeauxView } from "./cadeaux/view.ts";

import type { Avatar } from "@rzparty/shared";

export { celebrate, decor3D } from "./kit.ts";

/**
 * Mini-jeux qui se jouent « à plat » (lire, compter, retenir…) : ils gardent leur affichage lisible
 * et reçoivent un décor 3D (les joueurs sur des colonnes qui montent avec leur score).
 */
export const DECOR_3D: Record<string, { lowerIsBetter?: boolean; theme: number }> = {
  reflexes: { lowerIsBetter: true, theme: 0xb3261e },
  calcul: { theme: 0x2f7bef },
  memoire: { theme: 0x9257e8 },
  piratage: { theme: 0x1e2a4a },
  stroop: { theme: 0xf0483e },
  coupdoeil: { theme: 0x18bdbd },
  tri: { theme: 0x2db866 },
  paires: { theme: 0xf45fae },
  visage: { theme: 0xf2b705 },
  zappeur: { theme: 0x3c3c46 },
  puzzle: { theme: 0x9257e8 },
  aiguillages: { theme: 0x8a5530 },
  chrono: { theme: 0x2f7bef },
};

export type ViewLayout = "tv" | "pad" | "solo";

export interface ViewPlayer {
  id: string;
  name: string;
  color: number;
  isBot: boolean;
}

export interface MiniGameViewContext {
  layout: ViewLayout;
  /** Joueur de cet appareil (null sur l'écran commun ou pour un spectateur). */
  me: string | null;
  /** Participants de la manche. */
  players: ViewPlayer[];
  send(input: unknown): void;
  /** Heure du serveur estimée, pour les comptes à rebours. */
  serverNow(): number;
  /** Dessine l'avatar d'un joueur. */
  avatar(playerId: string, size: number): SVGSVGElement;
  /** Dessine n'importe quel personnage (avatars générés par un mini-jeu). */
  drawAvatar(avatar: Avatar, size: number): SVGSVGElement;
  /** Données de l'avatar d'un joueur (pour le dessiner en 3D), si on les a. */
  avatarData?(playerId: string): { avatar: Avatar; isBot: boolean } | null;
}

export interface MiniGameView {
  update(state: unknown): void;
  updatePrivate?(data: unknown): void;
  destroy(): void;
}

export type MiniGameViewFactory = (root: HTMLElement, ctx: MiniGameViewContext) => MiniGameView;

export const MINI_GAME_VIEWS: Record<string, MiniGameViewFactory> = {
  reflexes: reflexesView,
  calcul: calculView,
  memoire: memoireView,
  piratage: piratageView,
  labyrinthe: labyrintheView,
  bombe: bombeView,
  taupes: taupesView,
  stroop: stroopView,
  coupdoeil: coupdoeilView,
  tri: triView,
  escalier: escalierView,
  chrono: chronoView,
  vaetvient: vaetvientView,
  bandits: banditsView,
  paires: pairesView,
  visage: visageView,
  tremplin: tremplinView,
  liane: lianeView,
  pas: pasView,
  photo: photoView,
  zappeur: zappeurView,
  penalty: penaltyView,
  alunissage: alunissageView,
  ballons: ballonsView,
  ressort: ressortView,
  puzzle: puzzleView,
  haies: haiesView,
  aiguillages: aiguillagesView,
  perles: perlesView,
  cadeaux: cadeauxView,
};
