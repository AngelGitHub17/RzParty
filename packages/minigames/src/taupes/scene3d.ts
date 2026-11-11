/**
 * Tape-taupe en 3D : une pelouse avec 9 trous, des taupes qui sortent la tête (les dorées brillent),
 * et un maillet qui s'abat là où l'on tape. Les trous se touchent au premier contact (rapidité).
 */
import { HOLES, type TaupesState } from "./types.ts";
import { Particles, Stage3D, THREE, toon } from "../three/kit3d.ts";

const GAP = 2.1;

interface Hole {
  pos: THREE.Vector3;
  mole: THREE.Group;
  body: THREE.Mesh;
  up: number;
  target: number;
  golden: boolean;
}

export class TaupesScene {
  private readonly stage: Stage3D;
  private readonly holes: Hole[] = [];
  private readonly fx = new Particles();
  private readonly hammer = new THREE.Group();
  private swing: { at: THREE.Vector3; start: number } | null = null;
  private readonly brown = toon(0x8a5a32);
  private readonly gold = toon(0xffc83d, { emissive: 0x6a4a00 });
  private sparkleAt = 0;

  constructor(host: HTMLElement, interactive: boolean, private readonly onWhack: (hole: number) => void) {
    this.stage = new Stage3D(host, { fov: 40, pickOnPress: true });
    const scene = this.stage.scene;
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(GAP * 3 + 1.6, 0.4, GAP * 3 + 1.6), toon(0x8cc63f));
    lawn.position.y = -0.2;
    const fenceMat = toon(0xf2e0b6);
    for (const [x, z, w, d] of [[0, -(GAP * 1.5 + 0.9), GAP * 3 + 1.8, 0.15], [0, GAP * 1.5 + 0.9, GAP * 3 + 1.8, 0.15], [-(GAP * 1.5 + 0.9), 0, 0.15, GAP * 3 + 1.8], [GAP * 1.5 + 0.9, 0, 0.15, GAP * 3 + 1.8]] as const) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), fenceMat);
      fence.position.set(x, 0.17, z);
      scene.add(fence);
    }
    scene.add(lawn, this.fx.group);
    for (let i = 0; i < HOLES; i++) {
      const pos = new THREE.Vector3(((i % 3) - 1) * GAP, 0, (Math.floor(i / 3) - 1) * GAP);
      const dirt = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.16, 8, 24), toon(0x9a6542));
      dirt.rotation.x = Math.PI / 2;
      dirt.position.copy(pos).setY(0.04);
      const pit = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), toon(0x2a1a10));
      pit.rotation.x = -Math.PI / 2;
      pit.position.copy(pos).setY(0.03);
      // La taupe : corps, museau rose, yeux.
      const mole = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 14), this.brown);
      body.position.y = 0.5;
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), toon(0xf45fae));
      nose.position.set(0, 0.68, 0.4);
      const eyeMat = toon(0x1e2a4a);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat);
        eye.position.set(side * 0.15, 0.85, 0.36);
        mole.add(eye);
      }
      mole.add(body, nose);
      mole.position.copy(pos).setY(-1.2);
      // Le trou masque le bas de la taupe : on la coupe sous le sol.
      scene.add(dirt, pit, mole);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.6, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.copy(pos).setY(0.6);
      scene.add(hit);
      if (interactive) this.stage.pick(hit, () => this.onWhack(i));
      this.holes.push({ pos, mole, body, up: 0, target: 0, golden: false });
    }
    // Le maillet.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), toon(0x9a6542));
    handle.position.y = 0.7;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16), toon(0xf0483e));
    head.rotation.z = Math.PI / 2;
    head.position.y = 1.4;
    this.hammer.add(handle, head);
    this.hammer.visible = false;
    scene.add(this.hammer);
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 13 : 9.5, portrait ? 7.5 : 6.5), new THREE.Vector3(0, 0, 0.3), true);
  }

  update(s: TaupesState, hit: Set<number>, now: number): void {
    this.holes.forEach((h, i) => {
      const mole = s.moles.find((m) => m.hole === i && m.until > now);
      h.target = mole && !hit.has(mole.id) ? 1 : 0;
      if (mole) h.golden = mole.golden;
    });
  }

  /** Coup de maillet : étoiles si une taupe est touchée, poussière sinon. */
  whack(i: number, ok: boolean): void {
    const h = this.holes[i];
    if (!h) return;
    this.swing = { at: h.pos.clone(), start: performance.now() };
    setTimeout(() => {
      if (ok) {
        this.fx.burst(h.pos.clone().setY(1), { count: 16, colors: h.golden ? [0xffc83d, 0xffffff] : [0xffffff, 0xffe58a], speed: 2.6, life: 700, size: 0.2 });
        h.target = 0;
        h.up = Math.min(h.up, 0.5);
      } else this.fx.burst(h.pos.clone().setY(0.2), { count: 8, colors: [0x9a6542, 0xc9a36b], speed: 1.2, up: 0.6, gravity: 3, life: 500 });
    }, 90);
  }

  private tick(now: number, dt: number): void {
    for (const h of this.holes) {
      // Sortie rapide, rentrée un peu plus lente ; petit balancement quand elle est dehors.
      h.up += (h.target - h.up) * Math.min(1, dt * (h.target ? 16 : 10));
      h.mole.position.y = -1.2 + h.up * 1.2;
      h.mole.rotation.z = h.target ? Math.sin(now / 150 + h.pos.x) * 0.08 : 0;
      h.body.material = h.golden ? this.gold : this.brown;
      h.mole.visible = h.up > 0.02;
      if (h.golden && h.target && now - this.sparkleAt > 120) {
        this.sparkleAt = now;
        this.fx.burst(h.pos.clone().setY(1.3), { count: 1, colors: [0xffe58a], speed: 0.6, life: 600, size: 0.15 });
      }
    }
    // Le maillet s'abat puis disparaît.
    if (this.swing) {
      const t = (now - this.swing.start) / 260;
      this.hammer.visible = t < 1;
      this.hammer.position.copy(this.swing.at).add(new THREE.Vector3(0.5, 0, 0.3));
      this.hammer.rotation.z = t < 0.35 ? (t / 0.35) * 1.2 : 1.2 - Math.min(1, (t - 0.35) / 0.65) * 0.4;
      if (t >= 1) this.swing = null;
    }
    this.fx.tick(now, dt);
  }

  destroy(): void {
    this.stage.dispose();
  }
}
