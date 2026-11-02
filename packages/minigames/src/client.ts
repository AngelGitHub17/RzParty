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

import type { Avatar } from "@rzparty/shared";

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
};
