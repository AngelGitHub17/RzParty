/**
 * Alunissage en 3D : la Lune grise et ses cratères, la Terre au loin, un ciel étoilé, et une capsule
 * par joueur (à sa couleur) dont le moteur crache des flammes. Poussière à l'atterrissage,
 * fumée si l'on s'écrase. Les altitudes sont exactement celles du calcul du jeu.
 */
import { START_ALT } from "./types.ts";
import { Particles, Stage3D, THREE, toon } from "../three/kit3d.ts";

const TOP = 7.5;

interface Ship {
  group: THREE.Group;
  flame: THREE.Mesh;
  x: number;
  landed: boolean;
}

export class AlunissageScene {
  private readonly stage: Stage3D;
  private readonly ships = new Map<string, Ship>();
  private readonly fx = new Particles();

  constructor(host: HTMLElement, players: { id: string; color: string | number; me: boolean }[]) {
    this.stage = new Stage3D(host, { fov: 40, background: 0x0d1433 });
    const scene = this.stage.scene;
    const stars = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let k = 0; k < 400; k++) pts.push((Math.random() - 0.5) * 80, Math.random() * 30 + 2, -20 - Math.random() * 20);
    stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18 })));
    const earth = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 24), toon(0x2f7bef));
    const land = new THREE.Mesh(new THREE.SphereGeometry(2.21, 16, 12, 0, 2, 0.6, 1.2), toon(0x2db866));
    earth.add(land);
    earth.position.set(9, 10, -25);
    scene.add(earth);
    const moon = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 20), toon(0xc9ced8));
    moon.position.y = -0.5;
    scene.add(moon);
    for (let k = 0; k < 14; k++) {
      const crater = new THREE.Mesh(new THREE.TorusGeometry(0.4 + (k % 4) * 0.25, 0.12, 6, 18), toon(0xaab1bf));
      crater.rotation.x = Math.PI / 2;
      crater.position.set(-14 + k * 2.2, 0.02, -2 - (k % 3) * 2);
      scene.add(crater);
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(60, 0.04, 0.4), toon(0x2db866, { emissive: 0x0a3a1a }));
    pad.position.set(0, 0.02, 1.2);
    scene.add(pad, this.fx.group);
    players.forEach((p, i) => {
      const x = players.length === 1 ? 0 : -6 + (i * 12) / Math.max(1, players.length - 1);
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 20), toon(p.color));
      body.position.y = 0.95;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.25, 20), toon(0xffffff));
      base.position.y = 0.4;
      const window = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), toon(0xcdebff));
      window.position.set(0, 1, 0.38);
      group.add(body, base, window);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), toon(0xc9ced8));
        leg.position.set(side * 0.55, 0.15, 0);
        leg.rotation.z = side * 0.4;
        group.add(leg);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 12), toon(0xffc83d, { emissive: 0xff6a1f }));
      flame.rotation.x = Math.PI;
      flame.position.y = -0.2;
      group.add(flame);
      if (p.me) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 24), toon(0xffffff));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.3;
        group.add(ring);
      }
      group.position.set(x, TOP, 1.2);
      scene.add(group);
      this.ships.set(p.id, { group, flame, x, landed: false });
    });
    this.stage.onTick((now, dt) => this.fx.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    const wide = players.length > 1 ? 14 : 8;
    this.stage.look(new THREE.Vector3(0, TOP * 0.55, portrait ? wide * 1.6 : wide), new THREE.Vector3(0, TOP * 0.45, 0), true);
  }

  /** Appelé à chaque image. */
  draw(id: string, alt: number, thrust: boolean, landed: boolean, crashed: boolean): void {
    const s = this.ships.get(id);
    if (!s) return;
    s.group.position.y = Math.max(0, (alt / START_ALT) * TOP);
    s.group.rotation.z = crashed && landed ? 1.2 : 0;
    s.flame.visible = thrust && !landed;
    s.flame.scale.y = 0.8 + Math.random() * 0.5;
    if (s.flame.visible && Math.random() < 0.3) this.fx.burst(s.group.position.clone().setY(s.group.position.y - 0.4), { count: 1, colors: [0xffc83d, 0xff6a1f], speed: 0.6, up: -1.5, gravity: 2, life: 400, size: 0.18 });
    if (landed && !s.landed) {
      this.fx.burst(s.group.position.clone().setY(0.1), { count: 22, colors: crashed ? [0x5c6370, 0xff6a1f] : [0xc9ced8, 0xffffff], speed: 2.2, up: 0.5, gravity: 2, life: 900, size: 0.25 });
    }
    s.landed = landed;
  }

  destroy(): void {
    this.stage.dispose();
  }
}
