/**
 * Patate explosive en 3D : les joueurs en cercle sur une petite île, la bombe au-dessus du porteur
 * (sa mèche crépite plus vite quand ça chauffe), une flèche vers celui qui la recevra, et le BOUM.
 * Les éliminés restent assis, tout gris.
 */
import type { BombeState } from "./types.ts";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, toon, tree, type CastPlayer } from "../three/kit3d.ts";
import { ringColor } from "../three/players.ts";

const RING = 3.6;

export class BombeScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly bomb = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly spark: THREE.Mesh;
  private readonly arrow: THREE.Mesh;
  private holder: string | null = null;
  private target: string | null = null;
  private from = new THREE.Vector3();
  private passAt = 0;
  private heat = 0;
  private boomKey = "";
  private sparkAt = 0;
  private out = new Set<string>();

  constructor(host: HTMLElement, private readonly players: CastPlayer[]) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    const island = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.6, 0.8, 48), toon(0xe9d7a8));
    island.position.y = -0.4;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.05, 48), toon(0x8cc63f));
    grass.position.y = 0.01;
    const water = new THREE.Mesh(new THREE.CircleGeometry(40, 48), toon(0x4fb3ec));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    scene.add(water, island, grass);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      const t = tree(1 + (k % 2) * 0.3);
      t.position.set(Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4);
      scene.add(t);
    }
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), toon(0x1e2230));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12), toon(0x5c6370));
    cap.position.y = 0.44;
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(0xffc83d, { emissive: 0xff8a1f }));
    this.spark.position.set(0.1, 0.72, 0);
    this.bomb.add(this.body, cap, this.spark);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 12), toon(0xffc83d, { emissive: 0x6a4a00 }));
    this.arrow.rotation.x = Math.PI;
    scene.add(this.bomb, this.arrow, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.95, colorHex: ringColor });
    const n = players.length;
    this.cast.sync(players, players.map((p) => p.id), (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return new THREE.Vector3(Math.sin(a) * RING, 0, Math.cos(a) * RING);
    });
    this.cast.each((c) => c.face(new THREE.Vector3(0, 0, 0)));
    // Le nom de chacun au-dessus de sa tête.
    players.forEach((p, i) => {
      const a = (i / n) * Math.PI * 2;
      const tag = label((p as CastPlayer & { name?: string }).name ?? "", { scale: 0.35, width: 384, height: 96 });
      tag.position.set(Math.sin(a) * RING, 2.1, Math.cos(a) * RING);
      if ((p as { name?: string }).name) scene.add(tag);
    });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 13 : 9, portrait ? 11 : 9), new THREE.Vector3(0, 0.6, 0.4), true);
  }

  update(s: BombeState): void {
    this.heat = s.heat;
    if (s.holder !== this.holder) {
      this.from.copy(this.bomb.position);
      this.passAt = performance.now();
      this.holder = s.holder;
    }
    this.target = s.target;
    // Éliminés : assis et gris (on les penche en arrière).
    for (const id of s.out) {
      if (this.out.has(id)) continue;
      this.out.add(id);
      const c = this.cast.get(id);
      if (c) c.group.rotation.x = -1.2;
    }
    const key = s.blast ? `${s.blast.playerId}:${s.blast.at}` : "";
    if (key && key !== this.boomKey) {
      this.boomKey = key;
      const c = this.cast.get(s.blast!.playerId);
      const at = (c?.group.position ?? new THREE.Vector3()).clone().setY(1.6);
      this.fx.burst(at, { count: 60, colors: [0xff6a1f, 0xffc83d, 0xd63a00, 0x3c3c46], speed: 5, up: 1.2, gravity: 4, life: 1400, size: 0.4 });
      this.fx.burst(at, { count: 20, colors: [0x5c6370, 0x8f8a80], speed: 1.2, up: 1.5, gravity: -0.5, life: 2200, size: 0.8 });
      this.texts.add("BOUM !", at.clone().setY(2.8), "#ff8a1f", 1.1);
    }
    if (s.finished && s.alive[0]) this.cast.get(s.alive[0])?.cheer(5000);
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    const c = this.holder ? this.cast.get(this.holder) : undefined;
    this.bomb.visible = Boolean(c);
    if (c) {
      const to = c.group.position.clone().setY(2.1);
      const t = Math.min(1, (now - this.passAt) / 450);
      this.bomb.position.lerpVectors(this.from, to, t);
      this.bomb.position.y += Math.sin(t * Math.PI) * 1.4;
    }
    const tc = this.target && this.holder ? this.cast.get(this.target) : undefined;
    this.arrow.visible = Boolean(tc);
    if (tc) this.arrow.position.copy(tc.group.position).setY(2.3 + Math.abs(Math.sin(now / 250)) * 0.3);
    const beat = Math.sin(now / (this.heat === 2 ? 70 : this.heat === 1 ? 140 : 260));
    this.body.scale.setScalar(1 + beat * (0.03 + this.heat * 0.04));
    (this.body.material as THREE.MeshToonMaterial).emissive.setHex(this.heat === 2 && beat > 0 ? 0x7a1000 : this.heat === 1 && beat > 0.5 ? 0x3a0800 : 0x000000);
    if (this.bomb.visible && now - this.sparkAt > (this.heat === 2 ? 40 : this.heat === 1 ? 90 : 160)) {
      this.sparkAt = now;
      this.fx.burst(this.spark.getWorldPosition(new THREE.Vector3()), { count: 2, colors: [0xffc83d, 0xffffff], speed: 1.2, up: 1, gravity: 3, life: 400, size: 0.1 });
    }
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
