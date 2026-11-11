/**
 * Ballons volants en 3D : les ballons montent d'une prairie vers le ciel en se balançant ;
 * on les éclate au premier contact (confettis de leur couleur).
 */
import { BALLOON_COLORS, RISE_MS, type BallonsState } from "./types.ts";
import { Particles, Stage3D, THREE, cloud, toon } from "../three/kit3d.ts";

const WIDTH = 9;
const BOTTOM = -0.8;
const TOP = 8.6;

interface Bal {
  group: THREE.Group;
  born: number;
  x: number;
  z: number;
  color: number;
  popped: boolean;
}

export class BallonsScene {
  private readonly stage: Stage3D;
  private readonly balloons = new Map<number, Bal>();
  private readonly fx = new Particles();
  private readonly clouds: THREE.Group[] = [];

  constructor(
    host: HTMLElement,
    private readonly interactive: boolean,
    private readonly now: () => number,
    private readonly onPop: (id: number) => void,
  ) {
    this.stage = new Stage3D(host, { fov: 42, pickOnPress: true });
    const scene = this.stage.scene;
    const meadow = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 8), toon(0x8cc63f));
    meadow.position.set(0, -1.3, -2);
    scene.add(meadow, this.fx.group);
    for (let k = 0; k < 5; k++) {
      const c = cloud(0.9 + (k % 3) * 0.3);
      c.position.set(-9 + k * 4.5, 6 + (k % 2) * 2, -6);
      this.clouds.push(c);
      scene.add(c);
    }
    this.stage.onTick((t, dt) => this.tick(t, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, 3.9, portrait ? 21 : 13), new THREE.Vector3(0, 3.9, 0), true);
  }

  private make(id: number, color: number, x: number, born: number): Bal {
    const group = new THREE.Group();
    const hex = color === -1 ? 0xffc83d : new THREE.Color(BALLOON_COLORS[color]!.hex).getHex();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), toon(hex, color === -1 ? { emissive: 0x6a4a00 } : {}));
    ball.scale.y = 1.18;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 8), toon(hex));
    knot.position.y = -0.68;
    knot.rotation.x = Math.PI;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), toon(0xffffff));
    string.position.y = -1.3;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    shine.position.set(-0.2, 0.25, 0.42);
    group.add(ball, knot, string, shine);
    // Zone de toucher généreuse.
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    group.add(hit);
    this.stage.scene.add(group);
    if (this.interactive) this.stage.pick(group, () => this.onPop(id));
    const bal = { group, born, x: (x - 0.5) * WIDTH, z: ((id * 7919) % 100) / 100 - 0.5, color, popped: false };
    this.balloons.set(id, bal);
    return bal;
  }

  update(s: BallonsState, mine: Set<number>): void {
    const now = this.now();
    for (const b of s.balloons) {
      if (!this.balloons.has(b.id) && now - b.born <= RISE_MS) this.make(b.id, b.color, b.x, b.born);
      if (mine.has(b.id)) this.pop(b.id);
    }
  }

  /** Éclate un ballon (tout de suite sur cet appareil, sans attendre le serveur). */
  pop(id: number): void {
    const b = this.balloons.get(id);
    if (!b || b.popped) return;
    b.popped = true;
    const hex = b.color === -1 ? 0xffc83d : new THREE.Color(BALLOON_COLORS[b.color]!.hex).getHex();
    this.fx.burst(b.group.position.clone(), { count: 18, colors: [hex, 0xffffff], speed: 3, up: 0.3, gravity: 2, life: 600, size: 0.2 });
    this.remove(id);
  }

  private remove(id: number): void {
    const b = this.balloons.get(id);
    if (!b) return;
    this.stage.pick(b.group, null);
    this.stage.scene.remove(b.group);
    b.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.balloons.delete(id);
  }

  private tick(t: number, dt: number): void {
    const now = this.now();
    for (const [id, b] of this.balloons) {
      const p = (now - b.born) / RISE_MS;
      if (p > 1.05) {
        this.remove(id);
        continue;
      }
      b.group.position.set(b.x + Math.sin((now - b.born) / 400 + id) * 0.25, BOTTOM + p * (TOP - BOTTOM), b.z);
      b.group.rotation.z = Math.sin((now - b.born) / 500 + id) * 0.12;
    }
    for (const c of this.clouds) c.position.x = ((c.position.x + 12 + dt * 0.4) % 24) - 12;
    this.fx.tick(t, dt);
  }

  destroy(): void {
    this.stage.dispose();
  }
}
