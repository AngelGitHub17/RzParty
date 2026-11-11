/**
 * Chasse aux perles en 3D : six huîtres au fond de la mer (sable, algues qui ondulent, bulles).
 * Elles s'ouvrent sur une perle, une perle dorée… ou un crabe qui pince ; on attrape au premier contact.
 */
import { CLOSING_MS, OYSTERS, type PerlesState, type Treasure } from "./types.ts";
import { Particles, Stage3D, THREE, toon } from "../three/kit3d.ts";

interface Oyster {
  pos: THREE.Vector3;
  top: THREE.Group;
  open: number;
  target: number;
  pearl: THREE.Mesh;
  crab: THREE.Group;
  treasure: Treasure | null;
  grabbed: boolean;
}

export class PerlesScene {
  private readonly stage: Stage3D;
  private readonly oysters: Oyster[] = [];
  private readonly fx = new Particles();
  private readonly weeds: THREE.Mesh[] = [];
  private bubbleAt = 0;
  private readonly pearlMat = toon(0xf4f1ff, { emissive: 0x303040 });
  private readonly goldMat = toon(0xffc83d, { emissive: 0x6a4a00 });
  private pinched = false;
  private readonly tint: THREE.Mesh;

  constructor(host: HTMLElement, interactive: boolean, private readonly onGrab: (i: number) => void) {
    this.stage = new Stage3D(host, { fov: 40, pickOnPress: true });
    const scene = this.stage.scene;
    const sand = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 12), toon(0xf2e0b6));
    sand.position.y = -0.2;
    scene.add(sand, this.fx.group);
    // Algues.
    for (let k = 0; k < 14; k++) {
      const weed = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.6 + (k % 3) * 0.5, 6), toon(k % 2 ? 0x2f9a44 : 0x3fae49));
      weed.geometry.translate(0, 0.8, 0);
      weed.position.set(-9 + k * 1.4, 0, -3.5 + (k % 3) * 0.4);
      weed.userData.phase = k;
      this.weeds.push(weed);
      scene.add(weed);
    }
    for (let i = 0; i < OYSTERS; i++) {
      const pos = new THREE.Vector3(((i % 3) - 1) * 3.2, 0, (Math.floor(i / 3) - 0.5) * 3);
      const shellMat = toon(0x8f8a80);
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellMat);
      bottom.scale.set(1, 0.35, 0.8);
      bottom.position.copy(pos).setY(0.32);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), toon(0xffd1e6));
      inner.rotation.x = -Math.PI / 2;
      inner.scale.set(1, 0.8, 1);
      inner.position.copy(pos).setY(0.33);
      // Le couvercle tourne autour de la charnière (à l'arrière).
      const top = new THREE.Group();
      top.position.copy(pos).add(new THREE.Vector3(0, 0.34, -0.78));
      const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
      lid.scale.set(1, 0.35, 0.8);
      lid.position.set(0, 0, 0.78);
      top.add(lid);
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), this.pearlMat);
      pearl.position.copy(pos).setY(0.6);
      const crab = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), toon(0xf0483e));
      shell.scale.y = 0.6;
      for (const side of [-1, 1]) {
        const claw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(0xf0483e));
        claw.position.set(side * 0.45, 0.1, 0.2);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0x1e2a4a));
        eye.position.set(side * 0.12, 0.3, 0.25);
        crab.add(claw, eye);
      }
      crab.add(shell);
      crab.position.copy(pos).setY(0.55);
      scene.add(bottom, inner, top, pearl, crab);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.copy(pos).setY(0.6);
      scene.add(hit);
      if (interactive) this.stage.pick(hit, () => this.onGrab(i));
      this.oysters.push({ pos, top, open: 0, target: 0, pearl, crab, treasure: null, grabbed: false });
    }
    // Voile rouge quand la main est pincée.
    this.tint = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: 0xf0483e, transparent: true, opacity: 0, depthWrite: false }));
    this.tint.position.set(0, 3, 6);
    scene.add(this.tint);
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 16 : 10.5, portrait ? 12 : 9.5), new THREE.Vector3(0, 0, 0.6), true);
  }

  /** Appelé à chaque image avec l'heure du serveur. */
  update(s: PerlesState, taken: Set<number>, now: number, pinched: boolean): void {
    this.pinched = pinched;
    this.oysters.forEach((o, i) => {
      const op = s.openings.find((x) => x.oyster === i && x.from <= now && x.until > now);
      const grabbed = Boolean(op && taken.has(op.id));
      if (grabbed && !o.grabbed && op) {
        const at = o.pos.clone().setY(1);
        if (op.treasure === "crabe") this.fx.burst(at, { count: 12, colors: [0xf0483e, 0xffffff], speed: 2, life: 600 });
        else this.fx.burst(at, { count: 18, colors: op.treasure === "doree" ? [0xffc83d, 0xffffff] : [0xffffff, 0xd8f0ff], speed: 2.4, life: 800 });
      }
      o.grabbed = grabbed;
      o.target = op ? (op.until - now < CLOSING_MS ? 0.3 : 1) : 0;
      o.treasure = op ? op.treasure : null;
    });
  }

  private tick(now: number, dt: number): void {
    for (const o of this.oysters) {
      o.open += (o.target - o.open) * Math.min(1, dt * (o.target > o.open ? 14 : 12));
      o.top.rotation.x = -o.open * 1.1;
      const show = o.open > 0.25 && !o.grabbed;
      o.pearl.visible = show && (o.treasure === "perle" || o.treasure === "doree");
      o.pearl.material = o.treasure === "doree" ? this.goldMat : this.pearlMat;
      o.crab.visible = show && o.treasure === "crabe";
      o.crab.rotation.y = Math.sin(now / 120) * 0.4;
    }
    for (const w of this.weeds) w.rotation.z = Math.sin(now / 700 + (w.userData.phase as number)) * 0.18;
    if (now - this.bubbleAt > 300) {
      this.bubbleAt = now;
      this.fx.burst(new THREE.Vector3((Math.random() - 0.5) * 14, 0.2, -2 + Math.random() * 4), { count: 1, colors: [0xdff3ff], speed: 0.3, up: 1.5, gravity: -1.5, life: 2500, size: 0.2 });
    }
    const tm = this.tint.material as THREE.MeshBasicMaterial;
    tm.opacity += ((this.pinched ? 0.25 : 0) - tm.opacity) * 0.2;
    this.fx.tick(now, dt);
  }

  destroy(): void {
    this.stage.dispose();
  }
}
