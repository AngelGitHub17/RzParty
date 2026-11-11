/**
 * Course de haies en 3D : une piste de stade avec un couloir par joueur, les haies (qui tombent si
 * on les touche), la ligne d'arrivée, et les coureurs qui sautent. La caméra suit mon coureur
 * (ou le premier, sur l'écran commun).
 */
import { JUMP_MS, RACE_LENGTH, simulateRun } from "./types.ts";
import { Cast, Stage3D, THREE, label, toon, type CastPlayer } from "../three/kit3d.ts";
import { ringColor } from "../three/players.ts";

const LANE = 1.5;
const SCALE = 0.5; // mètres de course → unités 3D

interface Lane {
  hurdles: THREE.Group[];
}

export class HaiesScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly lanes = new Map<string, Lane>();
  private built = "";
  private camX = 0;

  constructor(host: HTMLElement, private readonly players: CastPlayer[], private readonly me: string | null) {
    this.stage = new Stage3D(host, { fov: 42 });
    const scene = this.stage.scene;
    const n = players.length;
    const width = n * LANE;
    const track = new THREE.Mesh(new THREE.BoxGeometry(RACE_LENGTH * SCALE + 30, 0.2, width + 0.6), toon(0xe07a4f));
    track.position.set((RACE_LENGTH * SCALE) / 2, -0.1, width / 2 - LANE / 2);
    const grass = new THREE.Mesh(new THREE.BoxGeometry(RACE_LENGTH * SCALE + 60, 0.1, 40), toon(0x7ed957));
    grass.position.set((RACE_LENGTH * SCALE) / 2, -0.2, 0);
    scene.add(grass, track);
    for (let i = 0; i <= n; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(RACE_LENGTH * SCALE + 30, 0.02, 0.05), toon(0xffffff));
      line.position.set((RACE_LENGTH * SCALE) / 2, 0.01, i * LANE - LANE / 2);
      scene.add(line);
    }
    // Ligne d'arrivée en damier et arche.
    for (let k = 0; k < n * 6; k++) {
      const sq = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.25), toon(k % 2 ? 0x1e2a4a : 0xffffff));
      sq.position.set(RACE_LENGTH * SCALE + (Math.floor(k / (n * 3)) * 0.25), 0.02, -LANE / 2 + 0.125 + (k % (n * 3)) * 0.25 * 2 * (LANE / 1.5) / 2);
      scene.add(sq);
    }
    const arch = label("ARRIVÉE", { scale: 0.8, width: 512, height: 128, color: "#ffe58a" });
    arch.position.set(RACE_LENGTH * SCALE, 3, width / 2 - LANE / 2);
    scene.add(arch);
    // Tribune.
    const stand = new THREE.Mesh(new THREE.BoxGeometry(RACE_LENGTH * SCALE + 30, 3, 2), toon(0x2f7bef));
    stand.position.set((RACE_LENGTH * SCALE) / 2, 1.5, -3);
    scene.add(stand);
    this.cast = new Cast(scene, { scale: 0.7, colorHex: ringColor });
    this.cast.sync(players, players.map((p) => p.id), (_, i) => new THREE.Vector3(0, 0, i * LANE));
    this.cast.each((c) => c.face(new THREE.Vector3(100, 0, c.group.position.z)));
    this.stage.onTick(() => this.cast.tick(performance.now()));
  }

  private build(hurdles: number[]): void {
    const key = hurdles.join(",");
    if (key === this.built) return;
    this.built = key;
    this.players.forEach((p, i) => {
      const lane: Lane = { hurdles: [] };
      for (const hx of hurdles) {
        const g = new THREE.Group();
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), toon(0xffffff));
          leg.position.set(0, 0.35, side * 0.5);
          g.add(leg);
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 1.1), toon(0xf0483e));
        bar.position.y = 0.7;
        g.add(bar);
        g.position.set(hx * SCALE, 0, i * LANE);
        this.stage.scene.add(g);
        lane.hurdles.push(g);
      }
      this.lanes.set(p.id, lane);
    });
  }

  /** Une image de la course, à l'instant `t` (ms depuis le départ). */
  draw(hurdles: number[], jumpsOf: (id: string) => number[], t: number): void {
    this.build(hurdles);
    let follow = this.me;
    let best = -1;
    this.players.forEach((p, i) => {
      const jumps = jumpsOf(p.id);
      const run = simulateRun(hurdles, jumps, t);
      if (!this.me && run.x > best) {
        best = run.x;
        follow = p.id;
      }
      const c = this.cast.get(p.id);
      if (!c) return;
      const last = jumps.filter((j) => j <= t).at(-1);
      const lift = run.air && last !== undefined && t - last < JUMP_MS ? Math.sin(((t - last) / JUMP_MS) * Math.PI) * 1.1 : 0;
      // Petite foulée quand il court.
      const stride = run.finishedAt === null && t > 0 && !run.air ? Math.abs(Math.sin(t / 110)) * 0.12 : 0;
      c.place(new THREE.Vector3(run.x * SCALE, lift + stride, i * LANE));
      c.group.rotation.z = run.air ? -0.15 : 0;
      const lane = this.lanes.get(p.id);
      lane?.hurdles.forEach((g, k) => {
        g.rotation.z = run.hit.includes(k) ? -1.3 : 0;
      });
      if (run.finishedAt !== null && run.finishedAt + 50 > t && t - run.finishedAt < 40) c.cheer(1500);
    });
    // La caméra suit, de côté et un peu en hauteur.
    const target = this.cast.get(follow ?? "")?.group.position.x ?? 0;
    this.camX += (target - this.camX) * 0.12;
    const width = this.players.length * LANE;
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(this.camX - 1.5, 3.2 + width * 0.25, width + (portrait ? 9 : 5.5)), new THREE.Vector3(this.camX + 2.5, 0.6, width / 2 - LANE / 2), true);
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
