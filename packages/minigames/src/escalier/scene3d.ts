/**
 * Escalier secret en 3D : un grand escalier par joueur, côte à côte, qui monte vers une plateforme
 * dorée. Les personnages grimpent marche par marche ; les bloqués tremblent, avec une bulle « +n ».
 */
import { STAIRS, type EscalierState } from "./types.ts";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, toon, type CastPlayer } from "../three/kit3d.ts";
import { ringColor } from "../three/players.ts";

const STEP_W = 0.8;
const STEP_H = 0.42;
const LANE = 1.6;

export class EscalierScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private revealKey = "";
  private heights: Record<string, number> = {};

  constructor(host: HTMLElement, private readonly players: CastPlayer[]) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    const n = players.length;
    players.forEach((p, i) => {
      const z = (i - (n - 1) / 2) * LANE;
      const color = new THREE.Color(ringColor(p.color));
      for (let k = 0; k < STAIRS; k++) {
        const h = (k + 1) * STEP_H;
        const step = new THREE.Mesh(new THREE.BoxGeometry(STEP_W, h, LANE - 0.2), toon(color.clone().lerp(new THREE.Color(0xffffff), 0.55 - (k / STAIRS) * 0.4)));
        step.position.set(k * STEP_W, h / 2, z);
        scene.add(step);
      }
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, STAIRS * STEP_H, n * LANE), toon(0xffc83d));
    top.position.set(STAIRS * STEP_W + 0.6, (STAIRS * STEP_H) / 2, 0);
    const flag = label("🏁", { scale: 0.9, width: 128, height: 128 });
    flag.position.set(STAIRS * STEP_W + 0.6, STAIRS * STEP_H + 0.9, 0);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, 20), toon(0x8cc63f));
    ground.position.set(STAIRS * STEP_W / 2, -0.1, 0);
    scene.add(ground, top, flag, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.7, colorHex: ringColor });
    this.stage.onTick((now, dt) => {
      this.cast.tick(now);
      this.fx.tick(now, dt);
      this.texts.tick(now);
    });
    const portrait = this.stage.aspect < 1;
    const cx = (STAIRS * STEP_W) / 2;
    this.stage.look(new THREE.Vector3(cx - 1, STAIRS * STEP_H * 0.8 + 2, n * LANE + (portrait ? 11 : 5)), new THREE.Vector3(cx, (STAIRS * STEP_H) / 2, 0), true);
  }

  private spot(height: number, i: number): THREE.Vector3 {
    const z = (i - (this.players.length - 1) / 2) * LANE;
    if (height <= 0) return new THREE.Vector3(-1, 0, z);
    if (height >= STAIRS) return new THREE.Vector3(STAIRS * STEP_W + 0.4, STAIRS * STEP_H, z);
    return new THREE.Vector3((height - 1) * STEP_W, height * STEP_H, z);
  }

  update(s: EscalierState): void {
    const ids = this.players.map((p) => p.id);
    this.cast.sync(this.players, ids, (id, i) => this.spot(s.heights[id] ?? 0, i));
    this.cast.each((c, id) => {
      const i = ids.indexOf(id);
      const from = this.heights[id] ?? 0;
      const to = s.heights[id] ?? 0;
      // Il grimpe marche par marche.
      if (to !== from) {
        const via: THREE.Vector3[] = [];
        for (let k = from + 1; k < to; k++) via.push(this.spot(k, i));
        c.goTo(this.spot(to, i), via);
        if (to >= STAIRS) {
          c.cheer(4000);
          this.fx.burst(this.spot(to, i).setY(STAIRS * STEP_H + 1.5), { count: 40, colors: [0xffc83d, 0xf0483e, 0x2f7bef, 0x2db866], speed: 3.5, life: 1600 });
        }
      }
      this.heights[id] = to;
      c.face(new THREE.Vector3(c.group.position.x + 5, 0, c.group.position.z + 2));
    });
    const key = s.phase === "reveal" ? String(s.round) : "";
    if (key && key !== this.revealKey && s.picks) {
      this.revealKey = key;
      for (const [id, n] of Object.entries(s.picks)) {
        const c = this.cast.get(id);
        if (!c) continue;
        const blocked = s.blocked.includes(id);
        this.texts.add(blocked ? `+${n} ✘` : `+${n}`, c.group.position.clone().setY(c.group.position.y + 1.6), blocked ? "#ff9a8a" : "#8ff0a4", 0.6);
      }
    }
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
