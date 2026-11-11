/**
 * Ruée vers l'Ouest en 3D : la façade d'un saloon en bois avec 8 fenêtres (2 rangées de 4).
 * Bandits (chapeau noir, foulard rouge) et habitants (chapeau de paille, sourire) surgissent ;
 * on tire au premier contact, avec éclats de bois ou étoiles.
 */
import { WINDOWS, type BanditsState } from "./types.ts";
import { FloatTexts, Particles, Stage3D, THREE, label, toon } from "../three/kit3d.ts";

interface Win {
  pos: THREE.Vector3;
  bandit: THREE.Group;
  habitant: THREE.Group;
  up: number;
  target: number;
  kind: "bandit" | "habitant";
  shutterL: THREE.Mesh;
  shutterR: THREE.Mesh;
}

function figure(kind: "bandit" | "habitant"): THREE.Group {
  const g = new THREE.Group();
  const skin = toon(kind === "bandit" ? 0xe9b07a : 0xf7cba0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), skin);
  head.position.y = 0.55;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.3, 6, 12), toon(kind === "bandit" ? 0x5a3a22 : 0x2f7bef));
  body.position.y = -0.2;
  g.add(head, body);
  const eyeMat = toon(0x1e2a4a);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), kind === "bandit" ? toon(0xffffff) : eyeMat);
    eye.position.set(side * 0.15, 0.62, 0.38);
    g.add(eye);
  }
  if (kind === "bandit") {
    const mask = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 24), toon(0x1e2a4a));
    mask.position.set(0, 0.62, 0.02);
    mask.rotation.x = Math.PI / 2;
    mask.scale.set(1.05, 1.05, 1);
    const scarf = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.4, 16, 1, true), toon(0xc0392b));
    scarf.position.y = 0.3;
    scarf.rotation.x = Math.PI;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20), toon(0x3a2414));
    brim.position.y = 0.9;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.35, 16), toon(0x3a2414));
    crown.position.y = 1.08;
    g.add(mask, scarf, brim, crown);
  } else {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 20), toon(0xf2b705));
    hat.position.y = 1.02;
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), eyeMat);
    smile.position.set(0, 0.46, 0.4);
    smile.rotation.z = Math.PI;
    g.add(hat, smile);
  }
  return g;
}

export class BanditsScene {
  private readonly stage: Stage3D;
  private readonly wins: Win[] = [];
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();

  constructor(host: HTMLElement, interactive: boolean, private readonly onShoot: (i: number) => void) {
    this.stage = new Stage3D(host, { fov: 40, pickOnPress: true });
    const scene = this.stage.scene;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 14), toon(0xd9a066));
    ground.position.set(0, -0.2, 2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(11, 7, 0.6), toon(0xa86b3c));
    wall.position.set(0, 3.5, -0.3);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 2), toon(0x6b4423));
    roof.position.set(0, 7.1, 0.4);
    const sign = label("SALOON", { scale: 1, width: 512, height: 128, color: "#ffe58a" });
    sign.position.set(0, 7.9, 0.6);
    // Planches horizontales.
    for (let k = 0; k < 9; k++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(11.02, 0.05, 0.62), toon(0x8a5530));
      plank.position.set(0, 0.4 + k * 0.78, -0.3);
      scene.add(plank);
    }
    // Cactus.
    for (const x of [-8, 8.5]) {
      const cactus = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 2, 6, 10), toon(0x2f9a44));
      cactus.position.set(x, 1.4, 1);
      scene.add(cactus);
    }
    scene.add(ground, wall, roof, sign, this.fx.group, this.texts.group);
    for (let i = 0; i < WINDOWS; i++) {
      const pos = new THREE.Vector3(((i % 4) - 1.5) * 2.5, Math.floor(i / 4) === 0 ? 4.9 : 2.0, 0);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.2, 0.3), toon(0x3a2414));
      frame.position.copy(pos).setZ(0.05);
      const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9), toon(0x1e1410));
      inside.position.copy(pos).setZ(0.21);
      scene.add(frame, inside);
      const bandit = figure("bandit");
      const habitant = figure("habitant");
      for (const f of [bandit, habitant]) {
        f.position.copy(pos).setZ(0.3);
        f.visible = false;
        scene.add(f);
      }
      // Volets battants.
      const shutterMat = toon(0xc08a4a);
      const shutterL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.08), shutterMat);
      const shutterR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.08), shutterMat);
      shutterL.geometry.translate(0.4, 0, 0);
      shutterR.geometry.translate(-0.4, 0, 0);
      shutterL.position.copy(pos).add(new THREE.Vector3(-0.8, 0, 0.32));
      shutterR.position.copy(pos).add(new THREE.Vector3(0.8, 0, 0.32));
      scene.add(shutterL, shutterR);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.6, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.copy(pos).setZ(0.6);
      scene.add(hit);
      if (interactive) this.stage.pick(hit, () => this.onShoot(i));
      this.wins.push({ pos, bandit, habitant, up: 0, target: 0, kind: "bandit", shutterL, shutterR });
    }
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, 4, portrait ? 17 : 11), new THREE.Vector3(0, 3.6, 0), true);
  }

  update(s: BanditsState, hit: Set<number>, now: number): void {
    this.wins.forEach((w, i) => {
      const p = s.popups.find((x) => x.window === i && x.until > now);
      w.target = p && !hit.has(p.id) ? 1 : 0;
      if (p) w.kind = p.kind;
    });
  }

  /** Tir dans une fenêtre : étoiles sur un bandit, « Oups ! » sur un habitant. */
  shot(i: number): void {
    const w = this.wins[i];
    if (!w || w.target === 0) return;
    const at = w.pos.clone().setZ(0.9);
    if (w.kind === "bandit") {
      this.fx.burst(at, { count: 18, colors: [0xffe58a, 0xffffff, 0xc08a4a], speed: 3, life: 700 });
      this.texts.add("+1", at.clone().setY(at.y + 1), "#8ff0a4", 0.7);
    } else {
      this.fx.burst(at, { count: 10, colors: [0xf0483e, 0xffffff], speed: 2, life: 600 });
      this.texts.add("Oups !", at.clone().setY(at.y + 1), "#ff9a8a", 0.7);
    }
    w.target = 0;
  }

  private tick(now: number, dt: number): void {
    for (const w of this.wins) {
      w.up += (w.target - w.up) * Math.min(1, dt * (w.target ? 18 : 10));
      // Les volets s'ouvrent, la silhouette surgit.
      w.shutterL.rotation.y = -w.up * 1.7;
      w.shutterR.rotation.y = w.up * 1.7;
      const fig = w.kind === "bandit" ? w.bandit : w.habitant;
      const other = w.kind === "bandit" ? w.habitant : w.bandit;
      other.visible = false;
      fig.visible = w.up > 0.05;
      fig.position.y = w.pos.y - 0.9 + w.up * 0.8;
      fig.scale.setScalar(0.6 + w.up * 0.4);
    }
    this.fx.tick(now, dt);
    this.texts.tick(now);
  }

  destroy(): void {
    this.stage.dispose();
  }
}
