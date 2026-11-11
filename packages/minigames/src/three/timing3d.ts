/**
 * Base des jeux « un appui au bon moment » en 3D (Grand tremplin, Liane folle, Ressort, Pas comptés,
 * Photo souvenir) : une scène vue de côté, le personnage du joueur, et une conversion des coordonnées
 * du dessin 2D d'origine vers la 3D, pour garder exactement les mêmes trajectoires.
 */
import { normalizeAvatar, type Avatar } from "@rzparty/shared";
import type { TimingState } from "../timing.ts";
import { Character3D, Particles, Stage3D, THREE } from "./kit3d.ts";

export interface PlayerLook {
  avatar: Avatar;
  isBot: boolean;
}

export interface Timing3D<P> {
  draw(t: number | null, params: P, pressedAt: number | null, phase: TimingState<P>["phase"], spectator: boolean): void;
  /** Le personnage à montrer (le joueur de l'appareil, ou le meilleur essai rejoué sur l'écran commun). */
  setPlayer(look: PlayerLook | null): void;
  destroy(): void;
}

export type Timing3DFactory<P> = (host: HTMLElement) => Timing3D<P>;

/** Échelle : 40 unités du dessin 2D = 1 unité 3D. */
export const UNIT = 40;

export class SideScene {
  readonly stage: Stage3D;
  readonly fx = new Particles();
  hero: Character3D;
  private heroKey = "";
  /** Conteneur du personnage (pour le tourner sans toucher à ses animations). */
  readonly heroPivot = new THREE.Group();

  constructor(
    host: HTMLElement,
    private readonly width: number,
    private readonly height: number,
    opts: { fov?: number; heroScale?: number } = {},
  ) {
    this.stage = new Stage3D(host, { fov: opts.fov ?? 38 });
    this.hero = new Character3D(normalizeAvatar(undefined), { scale: opts.heroScale ?? 0.9 });
    this.heroPivot.add(this.hero.group);
    this.stage.scene.add(this.heroPivot, this.fx.group);
    this.stage.onTick((now, dt) => {
      this.hero.tick(now);
      this.fx.tick(now, dt);
    });
  }

  /** Point du dessin 2D (x vers la droite, y vers le bas) en 3D (y vers le haut). */
  map(x: number, y: number, z = 0): THREE.Vector3 {
    return new THREE.Vector3((x - this.width / 2) / UNIT, (this.height - y) / UNIT, z);
  }

  /** Cadre la caméra sur tout le dessin 2D (un peu de biais pour la profondeur). */
  frame(margin = 1.08, tilt = 0.18): void {
    const w = this.width / UNIT;
    const h = this.height / UNIT;
    const fov = (this.stage.camera.fov * Math.PI) / 180;
    const fitH = (h / 2 / Math.tan(fov / 2)) * margin;
    const fitW = (w / 2 / Math.tan(fov / 2) / Math.max(0.3, this.stage.aspect)) * margin;
    const d = Math.max(fitH, fitW);
    const center = new THREE.Vector3(0, h / 2, 0);
    this.stage.look(center.clone().add(new THREE.Vector3(0, d * tilt, d)), center);
  }

  setPlayer(look: PlayerLook | null): void {
    const avatar = normalizeAvatar(look?.avatar);
    const key = JSON.stringify(avatar) + Boolean(look?.isBot);
    if (key === this.heroKey) return;
    this.heroKey = key;
    const scale = this.hero.group.children[0]?.scale.x ?? 1;
    this.heroPivot.remove(this.hero.group);
    this.hero.dispose();
    this.hero = new Character3D(avatar, { bot: look?.isBot, scale });
    this.heroPivot.add(this.hero.group);
  }

  /** Place le personnage à un point du dessin 2D, tourné de `deg` degrés (sens du dessin 2D). */
  placeHero(x: number, y: number, deg = 0, z = 0): void {
    this.heroPivot.position.copy(this.map(x, y, z));
    this.heroPivot.rotation.z = (-deg * Math.PI) / 180;
  }

  destroy(): void {
    this.hero.dispose();
    this.stage.dispose();
  }
}
