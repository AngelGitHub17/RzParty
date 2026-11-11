/**
 * Va-et-vient en 3D : une maisonnette dans un jardin ; des passants arrivent par la gauche et entrent,
 * d'autres sortent par la porte et s'en vont à droite. On compte !
 */
import { createRng, randomAvatar } from "@rzparty/shared";
import { Character3D, Stage3D, THREE, cloud, toon, tree } from "../three/kit3d.ts";

const DOOR = new THREE.Vector3(0, 0, 1.25);
const LEFT = -7.5;
const RIGHT = 7.5;

interface Walker {
  char: Character3D;
  /** Disparaît une fois arrivé. */
  vanish: boolean;
  bornAt: number;
}

export class VaetvientScene {
  private readonly stage: Stage3D;
  private readonly walkers: Walker[] = [];
  private readonly door = new THREE.Group();
  private readonly rng = createRng(11);
  private doorOpenUntil = 0;
  private readonly clouds: THREE.Group[] = [];

  constructor(host: HTMLElement) {
    this.stage = new Stage3D(host, { fov: 38 });
    const scene = this.stage.scene;
    // Jardin et chemin.
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 10), toon(0x7ed957));
    lawn.position.set(0, -0.2, 0);
    const path = new THREE.Mesh(new THREE.BoxGeometry(18, 0.06, 1.1), toon(0xe9d3a3));
    path.position.set(0, 0.02, 2.2);
    const alley = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.2), toon(0xe9d3a3));
    alley.position.set(0, 0.02, 1.4);
    scene.add(lawn, path, alley);
    // La maison : murs, toit, porte, fenêtres.
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 2.4), toon(0xffcf8a));
    walls.position.y = 1.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.05, 1.7, 4), toon(0xf0483e));
    roof.position.y = 3.25;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.82);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), toon(0xb3261e));
    chimney.position.set(0.9, 3.5, -0.3);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.65, 0.08), toon(0x5a3418));
    frame.position.set(0, 0.85, 1.21);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.5, 0.08), toon(0x7d4c27));
    leaf.position.set(0.42, 0, 0);
    this.door.add(leaf);
    this.door.position.set(-0.42, 0.8, 1.26);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xffc83d));
    knob.position.set(0.7, 0, 0.06);
    this.door.add(knob);
    const glass = toon(0xbfe6ff, { emissive: 0x29506e });
    for (const x of [-1.15, 1.15]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.08), glass);
      win.position.set(x, 1.45, 1.22);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.18), toon(0xffffff));
      sill.position.set(x, 1.05, 1.27);
      house.add(win, sill);
    }
    house.add(walls, roof, chimney, frame, this.door);
    scene.add(house);
    // Quelques arbres et nuages.
    for (const [x, z, s] of [[-5.2, -2, 1.1], [5.4, -1.6, 1.25], [-8.5, -3, 0.9], [8.6, -2.8, 1]] as const) {
      const t = tree(s);
      t.position.set(x, 0, z);
      scene.add(t);
    }
    for (let k = 0; k < 4; k++) {
      const c = cloud(0.8 + (k % 2) * 0.3);
      c.position.set(-9 + k * 6, 6 + (k % 2), -6);
      this.clouds.push(c);
      scene.add(c);
    }
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 5.5 : 3.4, portrait ? 17 : 9), new THREE.Vector3(0, 1.4, 0.8), true);
  }

  /** Un ou plusieurs passants entrent (`in`) ou sortent (`out`). */
  move(dir: "in" | "out", count: number): void {
    const now = performance.now();
    this.doorOpenUntil = now + 1100 + count * 200;
    for (let i = 0; i < count; i++) {
      const char = new Character3D(randomAvatar(this.rng), { scale: 0.78 });
      char.hopMs = 170;
      const lane = 2.2 + (i % 2) * 0.35;
      const steps: THREE.Vector3[] = [];
      if (dir === "in") {
        char.place(new THREE.Vector3(LEFT - i * 1.1, 0, lane));
        for (let x = LEFT - i * 1.1 + 0.9; x < -0.2; x += 0.9) steps.push(new THREE.Vector3(x, 0, lane));
        steps.push(new THREE.Vector3(0, 0, 1.6), DOOR.clone());
      } else {
        char.place(DOOR.clone().setZ(0.6));
        steps.push(DOOR.clone(), new THREE.Vector3(0, 0, lane));
        for (let x = 0.9; x < RIGHT + i * 1.1; x += 0.9) steps.push(new THREE.Vector3(x, 0, lane));
      }
      char.goTo(steps.pop()!, steps);
      this.stage.scene.add(char.group);
      this.walkers.push({ char, vanish: true, bornAt: now });
    }
  }

  private tick(now: number, dt: number): void {
    // La porte s'ouvre pendant les passages.
    const open = now < this.doorOpenUntil ? 1 : 0;
    this.door.rotation.y += (-open * 1.4 - this.door.rotation.y) * Math.min(1, dt * 8);
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i]!;
      w.char.tick(now);
      // Arrivé (ou bloqué trop longtemps) : il disparaît.
      if ((!w.char.moving && now - w.bornAt > 300) || now - w.bornAt > 9000) {
        this.stage.scene.remove(w.char.group);
        w.char.dispose();
        this.walkers.splice(i, 1);
      }
    }
    for (const c of this.clouds) c.position.x = ((c.position.x + 12 + dt * 0.35) % 24) - 12;
  }

  destroy(): void {
    for (const w of this.walkers) w.char.dispose();
    this.stage.dispose();
  }
}
