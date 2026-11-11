/**
 * Cris en folie en 3D : les téléphones posés sur la table basse du salon, qui vibrent et lancent des ondes
 * quand ils crient ; la bête à trouver flotte au-dessus ; les joueurs autour, mains en l'air.
 * Celui qui attrape un téléphone saute dessus ; le bon fait jaillir des confettis, le mauvais un nuage gris.
 */
import { CREATURES, PLAYER_COLORS, type CrisState, type PublicPlayer } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label } from "./kit3d.ts";
import { coffeeTable, phone3D, salonDecor } from "./salonDecor.ts";
import { hashId } from "../game/salonKit.ts";
import { serverNow } from "../game/clock.ts";

const RING = 3.4;
const CRY_EVERY = 2600;

interface Phone {
  group: THREE.Group;
  screen: THREE.Mesh;
  base: THREE.Vector3;
  wave: THREE.Mesh;
}

export class CrisScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly phones = new Map<string, Phone>();
  private creature: THREE.Sprite | null = null;
  private creatureKey = "";
  private state: CrisState | null = null;
  private seenClaim = 0;

  constructor(host: HTMLElement, compact: boolean) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    scene.add(salonDecor({ rug: 0x5ec7c0 }).group, coffeeTable(), this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.9, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 9 : compact ? 5.2 : 4.8, portrait ? 10 : compact ? 7.6 : 7), new THREE.Vector3(0, 1.4, 0), true);
  }

  update(c: CrisState, players: PublicPlayer[]): void {
    this.state = c;
    const ids = Object.keys(c.scores).filter((id) => players.some((p) => p.id === id));
    this.cast.sync(players, ids, (_, i) => {
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2 + 0.3;
      return new THREE.Vector3(Math.sin(a) * RING, 0, Math.cos(a) * RING);
    });
    // Les téléphones sur la table (un par appareil qui joue).
    const devices = Object.keys(c.sounds);
    for (const [id, p] of this.phones) {
      if (!devices.includes(id)) {
        this.stage.scene.remove(p.group, p.wave);
        this.phones.delete(id);
      }
    }
    devices.forEach((id, i) => {
      let p = this.phones.get(id);
      if (!p) {
        const owner = players.find((x) => x.id === id);
        const { group, screen } = phone3D(PLAYER_COLORS[owner?.color ?? 0]?.hex ?? 0x3d8bff);
        const wave = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
        wave.rotation.x = Math.PI / 2;
        p = { group, screen, base: new THREE.Vector3(), wave };
        this.phones.set(id, p);
        this.stage.scene.add(group, wave);
      }
      const a = (i / Math.max(1, devices.length)) * Math.PI * 2;
      const r = devices.length > 1 ? 1.05 : 0;
      p.base.set(Math.sin(a) * r, 0.86, Math.cos(a) * r);
      p.group.rotation.y = a;
    });
    // La bête à trouver.
    const key = c.phase === "listen" || c.phase === "claimed" ? String(c.target) : "";
    if (key !== this.creatureKey) {
      this.creatureKey = key;
      if (this.creature) {
        this.stage.scene.remove(this.creature);
        this.creature.material.map?.dispose();
        this.creature.material.dispose();
        this.creature = null;
      }
      if (c.target !== null && key) {
        const cr = CREATURES[c.target]!;
        this.creature = label(cr.emoji, { scale: 1.8, width: 256, height: 256, outline: "#ffffff" });
        this.creature.position.set(0, 3.4, 0);
        this.stage.scene.add(this.creature);
      }
    }
    // Quelqu'un attrape un téléphone.
    if (c.lastClaim && c.lastClaim.at !== this.seenClaim) {
      this.seenClaim = c.lastClaim.at;
      const who = this.cast.get(c.lastClaim.by);
      const ph = this.phones.get(c.lastClaim.device);
      if (who && ph) {
        const at = ph.base.clone();
        const home = who.group.position.clone();
        who.goTo(at.clone().multiplyScalar(1.7).setY(0));
        setTimeout(() => who.goTo(home), 650);
        if (c.lastClaim.ok) {
          this.fx.burst(at.clone().setY(1.4), { count: 40, colors: [0xffc83d, 0xf45fae, 0x3d8bff, 0x3dbe5b], speed: 3, up: 1.4, gravity: 3, life: 1300, size: 0.25 });
          this.texts.add("+1", at.clone().setY(2.2), "#ffe58a", 0.8);
          setTimeout(() => who.cheer(1600), 500);
        } else {
          this.fx.burst(at.clone().setY(1.2), { count: 14, colors: [0x8f8a80, 0x5c6370], speed: 1, up: 1, gravity: -0.3, life: 1200, size: 0.5 });
          this.texts.add("Raté !", at.clone().setY(2), "#ff6a5e", 0.6);
        }
      }
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    const c = this.state;
    const listening = c?.phase === "listen" && c.listenAt !== null;
    const t = serverNow();
    for (const [id, p] of this.phones) {
      // Le téléphone vibre pendant son cri (même rythme que sur l'appareil).
      let crying = 0;
      if (listening) {
        const since = (t - c!.listenAt! - (hashId(id) % 900)) % CRY_EVERY;
        if (since >= 0 && since < 900) crying = 1 - since / 900;
      }
      p.group.position.copy(p.base);
      p.group.position.x += Math.sin(now / 22) * 0.04 * crying;
      p.group.position.y += crying * 0.05;
      const wm = p.wave.material as THREE.MeshBasicMaterial;
      p.wave.position.copy(p.base).setY(1.0);
      p.wave.scale.setScalar(0.4 + (1 - crying) * 1.4);
      wm.opacity = crying * 0.8;
    }
    if (this.creature) {
      this.creature.position.y = 3.4 + Math.sin(now / 400) * 0.15;
      this.creature.material.rotation = Math.sin(now / 520) * 0.08;
    }
    // Pendant l'écoute, les joueurs trépignent (prêts à bondir).
    if (listening) this.cast.each((ch) => ch.group.scale.setScalar(1 + Math.abs(Math.sin(now / 200 + ch.group.id)) * 0.04));
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
