/**
 * Labyrinthe en 3D : un jardin de haies vu d'en haut (légèrement penché pour le relief), l'étoile
 * de sortie qui tourne, et les personnages qui avancent de case en case. Le haut de l'écran reste « haut ».
 */
import { OPEN, type LabyState } from "./types.ts";
import { Cast, Particles, Stage3D, THREE, toon, type CastPlayer } from "../three/kit3d.ts";
import { ringColor } from "../three/players.ts";

export class LabyScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly maze = new THREE.Group();
  private readonly fx = new Particles();
  private readonly star: THREE.Mesh;
  private built = "";
  private size = 9;
  private arrived = new Set<string>();

  constructor(host: HTMLElement, private readonly players: CastPlayer[], private readonly me: string | null) {
    this.stage = new Stage3D(host, { fov: 40 });
    const shape = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.18 : 0.42;
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    this.star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), toon(0xffc83d, { emissive: 0x6a4a00 }));
    this.stage.scene.add(this.maze, this.star, this.fx.group);
    this.cast = new Cast(this.stage.scene, { scale: 0.42, colorHex: ringColor });
    this.stage.onTick((now, dt) => {
      this.cast.tick(now);
      this.fx.tick(now, dt);
      this.star.rotation.y = now / 600;
    });
  }

  private cellPos(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (this.size - 1) / 2, 0, y - (this.size - 1) / 2);
  }

  private build(s: LabyState): void {
    const key = s.cells.join(",");
    if (key === this.built) return;
    this.built = key;
    this.size = s.size;
    for (const c of [...this.maze.children]) this.maze.remove(c);
    const n = s.size;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(n + 0.4, 0.2, n + 0.4), toon(0xe9d7a8));
    floor.position.y = -0.1;
    this.maze.add(floor);
    const start = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.02, 0.85), toon(0x8ff0a4));
    start.position.copy(this.cellPos(0, 0)).setY(0.01);
    const exit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.02, 0.85), toon(0xffe58a));
    exit.position.copy(this.cellPos(s.exit.x, s.exit.y)).setY(0.01);
    this.maze.add(start, exit);
    this.star.position.copy(this.cellPos(s.exit.x, s.exit.y)).setY(0.9);
    // Les haies : murs extérieurs puis murs intérieurs (droite et bas de chaque case).
    const hedge = toon(0x2f9a44);
    const wall = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), hedge);
      m.position.set(x, 0.27, z);
      this.maze.add(m);
    };
    const half = n / 2;
    wall(0, -half, n + 0.12, 0.12);
    wall(0, half, n + 0.12, 0.12);
    wall(-half, 0, 0.12, n + 0.12);
    wall(half, 0, 0.12, n + 0.12);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const c = s.cells[y * n + x]!;
        const p = this.cellPos(x, y);
        if (!(c & OPEN.droite) && x < n - 1) wall(p.x + 0.5, p.z, 0.12, 1.12);
        if (!(c & OPEN.bas) && y < n - 1) wall(p.x, p.z + 0.5, 1.12, 0.12);
      }
    }
    const portrait = this.stage.aspect < 1;
    const d = n * (portrait ? 1.9 : 1.25);
    this.stage.look(new THREE.Vector3(0, d, d * 0.35), new THREE.Vector3(0, 0, 0.3), true);
  }

  update(s: LabyState): void {
    this.build(s);
    // Plusieurs personnages sur la même case : petit décalage (le mien reste au centre).
    const ids = this.players.map((p) => p.id).filter((id) => s.positions[id]);
    this.cast.sync(this.players, ids, (id, i) => {
      const pos = s.positions[id]!;
      const off = id === this.me ? [0, 0] : [Math.cos(i * 2.4) * 0.22, Math.sin(i * 2.4) * 0.22];
      return this.cellPos(pos.x, pos.y).add(new THREE.Vector3(off[0]!, 0, off[1]!));
    });
    this.cast.each((c, id) => {
      c.hopMs = 90;
      if (s.arrived.includes(id) && !this.arrived.has(id)) {
        this.arrived.add(id);
        c.cheer(3000);
        this.fx.burst(this.star.position.clone(), { count: 30, colors: [0xffc83d, 0xffffff, 0x8ff0a4], speed: 2.5, life: 1000 });
      }
    });
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
