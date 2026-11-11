/**
 * Course d'escargots en 3D : un potager, un couloir de terre par joueur, des escargots à coquille
 * de la couleur du joueur (qui s'étirent à chaque élan) et une belle salade à l'arrivée.
 * Un escargot essoufflé transpire 💦 ; à l'arrivée, il croque la salade.
 */
import { PLAYER_COLORS } from "@rzparty/shared";
import { FloatTexts, Particles, Stage3D, THREE, cloud, label, toon, tree, type CastPlayer } from "../three/kit3d.ts";
import { SNAIL_GOAL, type EscargotsState } from "./types.ts";

const START = -6;
const END = 6;

interface Snail {
  group: THREE.Group;
  body: THREE.Mesh;
  x: number;
  lastProgress: number;
  stretchAt: number;
  tiredShown: number;
  arrived: boolean;
}

export class EscargotsScene {
  private readonly stage: Stage3D;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly snails = new Map<string, Snail>();

  constructor(host: HTMLElement, players: CastPlayer[], me: string | null) {
    this.stage = new Stage3D(host, { fov: 38 });
    const scene = this.stage.scene;
    const n = players.length;
    const gap = 1.25;
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, n * gap + 6), toon(0x7ed957));
    lawn.position.y = -0.2;
    scene.add(lawn);
    players.forEach((p, i) => {
      const z = (i - (n - 1) / 2) * gap;
      const lane = new THREE.Mesh(new THREE.BoxGeometry(END - START + 1.6, 0.05, 0.9), toon(i % 2 ? 0x9a6542 : 0x8a5a32));
      lane.position.set((START + END) / 2, 0.02, z);
      scene.add(lane);
      // La salade d'arrivée.
      const lettuce = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toon(k % 2 ? 0x5fd35f : 0x3fae49));
        leaf.position.set(Math.cos(k) * 0.12, 0.22 + (k % 3) * 0.05, Math.sin(k) * 0.12);
        leaf.scale.set(1, 0.7, 1);
        lettuce.add(leaf);
      }
      lettuce.position.set(END + 0.6, 0, z);
      scene.add(lettuce);
      // L'escargot : coquille (couleur du joueur), corps, cornes.
      const color = new THREE.Color(PLAYER_COLORS[p.color]?.hex ?? "#ffffff").getHex();
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 6, 12), toon(0xd9c28f));
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.16;
      const shell = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.14, 12, 24), toon(color));
      shell.position.set(-0.08, 0.42, 0);
      const shellCore = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), toon(color));
      shellCore.position.copy(shell.position);
      shellCore.scale.set(1, 1, 0.75);
      group.add(body, shell, shellCore);
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), toon(0xd9c28f));
        horn.position.set(0.42, 0.38, side * 0.07);
        horn.rotation.z = -0.4;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(0x1e2a4a));
        eye.position.set(0.48, 0.52, side * 0.07);
        group.add(horn, eye);
      }
      group.position.set(START, 0, z);
      if (p.id === me) {
        const tag = label("Moi", { scale: 0.35, width: 160, height: 80, color: "#ffe58a" });
        tag.position.set(0, 1, 0);
        group.add(tag);
      }
      scene.add(group);
      this.snails.set(p.id, { group, body, x: START, lastProgress: 0, stretchAt: 0, tiredShown: 0, arrived: false });
    });
    for (const [x, z] of [[-9, -4], [9, -4], [-8, 5], [9, 5]] as const) {
      const t = tree(1.1);
      t.position.set(x, 0, z);
      scene.add(t);
    }
    for (let k = 0; k < 3; k++) {
      const c = cloud(1);
      c.position.set(-6 + k * 6, 6, -8);
      scene.add(c);
    }
    scene.add(this.fx.group, this.texts.group);
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    const depth = n * gap;
    this.stage.look(new THREE.Vector3(0, portrait ? 8 + depth : 4 + depth * 0.5, portrait ? 11 + depth : 7.4 + depth * 0.45), new THREE.Vector3(0, 0, 0.2), true);
  }

  update(s: EscargotsState, serverNow: number): void {
    for (const [id, sn] of this.snails) {
      const progress = s.progress[id] ?? 0;
      if (progress > sn.lastProgress) sn.stretchAt = performance.now();
      sn.lastProgress = progress;
      sn.x = START + ((END - START) * progress) / SNAIL_GOAL;
      const tired = (s.tiredUntil[id] ?? 0) > serverNow;
      if (tired && sn.tiredShown !== s.tiredUntil[id]) {
        sn.tiredShown = s.tiredUntil[id]!;
        this.texts.add("💦", sn.group.position.clone().setY(1.1), "#7ec8ff", 0.6);
      }
      if (id in s.finished && !sn.arrived) {
        sn.arrived = true;
        this.fx.burst(new THREE.Vector3(END + 0.6, 0.6, sn.group.position.z), { count: 18, colors: [0x5fd35f, 0x3fae49, 0xffffff], speed: 2, up: 1.4, gravity: 3, life: 900, size: 0.18 });
      }
    }
  }

  private tick(now: number, dt: number): void {
    for (const sn of this.snails.values()) {
      sn.group.position.x += (sn.x - sn.group.position.x) * Math.min(1, dt * 6);
      // Le corps s'étire à chaque élan.
      const k = Math.max(0, 1 - (now - sn.stretchAt) / 220);
      sn.body.scale.set(1, 1 + k * 0.35, 1);
      sn.group.rotation.z = Math.sin(now / 120) * 0.02 * k;
    }
    this.fx.tick(now, dt);
    this.texts.tick(now);
  }

  destroy(): void {
    this.stage.dispose();
  }
}
