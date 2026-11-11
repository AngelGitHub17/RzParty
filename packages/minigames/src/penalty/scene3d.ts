/**
 * Tirs au but en 3D : vu de derrière le tireur, le but et ses filets, le gardien qui plonge,
 * le ballon qui part (au-dessus, arrêté ou au fond), et une pluie de confettis pour un but.
 */
import { normalizeAvatar } from "@rzparty/shared";
import type { Dir, ShotOutcome } from "./types.ts";
import { Character3D, FloatTexts, Particles, Stage3D, THREE, label, toon } from "../three/kit3d.ts";
import type { PlayerLook } from "../three/timing3d.ts";

const GOAL_W = 7.3;
const GOAL_H = 2.6;
const GOAL_Z = -11;
const SPOT = new THREE.Vector3(0, 0.22, 0);
const TARGET_X = [-2.6, 0, 2.6];

export class PenaltyScene {
  private readonly stage: Stage3D;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly ball: THREE.Group;
  private readonly keeper = new THREE.Group();
  private shooter: Character3D;
  private shooterKey = "";
  private shot: { to: THREE.Vector3; keeperTo: THREE.Vector3; keeperRot: number; outcome: ShotOutcome; start: number; done: boolean } | null = null;

  constructor(host: HTMLElement) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    // Pelouse rayée et lignes.
    for (let k = 0; k < 10; k++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 3), toon(k % 2 ? 0x6fc24a : 0x7ed957));
      stripe.position.set(0, -0.1, 6 - k * 3);
      scene.add(stripe);
    }
    const lineMat = toon(0xffffff);
    const box = new THREE.Mesh(new THREE.BoxGeometry(16, 0.02, 0.12), lineMat);
    box.position.set(0, 0.01, GOAL_Z + 5.5);
    const goalLine = new THREE.Mesh(new THREE.BoxGeometry(24, 0.02, 0.12), lineMat);
    goalLine.position.set(0, 0.01, GOAL_Z);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), lineMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.012, 0);
    scene.add(box, goalLine, spot);
    // Le but : poteaux, barre, filets.
    const postMat = toon(0xffffff);
    for (const x of [-GOAL_W / 2, GOAL_W / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, GOAL_H, 10), postMat);
      post.position.set(x, GOAL_H / 2, GOAL_Z);
      scene.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, GOAL_W, 10), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_H, GOAL_Z);
    const net = new THREE.Mesh(new THREE.BoxGeometry(GOAL_W, GOAL_H, 1.6, 18, 7, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.45 }));
    net.position.set(0, GOAL_H / 2, GOAL_Z - 0.8);
    scene.add(bar, net);
    // Tribune colorée au fond.
    const stand = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 2), toon(0x2f7bef));
    stand.position.set(0, 2, GOAL_Z - 6);
    scene.add(stand);
    for (let k = 0; k < 60; k++) {
      const fan = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), toon([0xf0483e, 0xffc83d, 0xffffff, 0x2db866][k % 4]!));
      fan.position.set(-16 + (k % 30) * 1.1, 3.4 + Math.floor(k / 30) * 0.7, GOAL_Z - 5.4 + Math.floor(k / 30) * 0.3);
      fan.userData.fan = k;
      scene.add(fan);
    }
    // Le gardien (un grand bonhomme orange aux gants jaunes).
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 6, 14), toon(0xf0483e));
    body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), toon(0xffd9b8));
    head.position.y = 2.05;
    const gloveMat = toon(0xffc83d);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.6, 4, 8), toon(0xf0483e));
      arm.rotation.z = side * 1.1;
      arm.position.set(side * 0.7, 1.5, 0);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), gloveMat);
      glove.position.set(side * 1.05, 1.75, 0);
      this.keeper.add(arm, glove);
    }
    this.keeper.add(body, head);
    this.keeper.position.set(0, 0, GOAL_Z + 0.4);
    scene.add(this.keeper);
    // Le ballon.
    this.ball = new THREE.Group();
    const leather = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), toon(0xffffff));
    const patch = new THREE.Mesh(new THREE.IcosahedronGeometry(0.225, 0), new THREE.MeshBasicMaterial({ color: 0x1e2a4a, wireframe: true }));
    this.ball.add(leather, patch);
    this.ball.position.copy(SPOT);
    scene.add(this.ball, this.fx.group, this.texts.group);
    this.shooter = new Character3D(normalizeAvatar(undefined), { scale: 1 });
    this.shooter.place(new THREE.Vector3(1.1, 0, 1.0));
    this.shooter.face(new THREE.Vector3(-3, 0, -8));
    scene.add(this.shooter.group);
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(1.2, portrait ? 3.4 : 2.9, portrait ? 10 : 7.2), new THREE.Vector3(0, 1.2, GOAL_Z), true);
  }

  setShooter(look: PlayerLook | null): void {
    const avatar = normalizeAvatar(look?.avatar);
    const key = JSON.stringify(avatar) + Boolean(look?.isBot);
    if (key === this.shooterKey) return;
    this.shooterKey = key;
    this.stage.scene.remove(this.shooter.group);
    this.shooter.dispose();
    this.shooter = new Character3D(avatar, { scale: 1, bot: look?.isBot });
    this.shooter.place(new THREE.Vector3(1.1, 0, 1.0));
    this.shooter.face(new THREE.Vector3(-3, 0, -8));
    this.stage.scene.add(this.shooter.group);
  }

  /** Remet le ballon sur le point de penalty et le gardien au centre. */
  reset(): void {
    this.shot = null;
    this.ball.position.copy(SPOT);
    this.keeper.position.set(0, 0, GOAL_Z + 0.4);
    this.keeper.rotation.z = 0;
  }

  /** Joue un tir (une seule fois par résultat). */
  show(dir: Dir | null, keeper: Dir | null, outcome: ShotOutcome): void {
    if (this.shot) return;
    const keeperTo = keeper === null ? new THREE.Vector3(0, 0, GOAL_Z + 0.4) : new THREE.Vector3(TARGET_X[keeper]! * 0.75, keeper === 1 ? 0.3 : 0, GOAL_Z + 0.4);
    const keeperRot = keeper === 0 ? 1.1 : keeper === 2 ? -1.1 : 0;
    const x = dir === null ? 0 : TARGET_X[dir]!;
    const to =
      outcome === "dessus" ? new THREE.Vector3(x, GOAL_H + 2.5, GOAL_Z - 4)
      : outcome === "arret" ? new THREE.Vector3(x * 0.75, 1.3, GOAL_Z + 0.9)
      : outcome === "rate" ? SPOT.clone()
      : new THREE.Vector3(x, 1.2, GOAL_Z - 1.2);
    this.shot = { to, keeperTo, keeperRot, outcome, start: performance.now(), done: false };
  }

  private tick(now: number, dt: number): void {
    const s = this.shot;
    if (s) {
      const t = Math.min(1, (now - s.start) / 650);
      if (s.outcome !== "rate") {
        this.ball.position.lerpVectors(SPOT, s.to, t);
        this.ball.position.y += Math.sin(t * Math.PI) * 0.8;
        this.ball.rotation.x -= dt * 14;
      }
      const k = Math.min(1, t * 1.4);
      this.keeper.position.lerpVectors(new THREE.Vector3(0, 0, GOAL_Z + 0.4), s.keeperTo, k);
      this.keeper.rotation.z = s.keeperRot * k;
      if (t >= 1 && !s.done) {
        s.done = true;
        if (s.outcome === "but") {
          this.fx.burst(s.to.clone().setY(2), { count: 50, colors: [0xf0483e, 0x2f7bef, 0xffc83d, 0x2db866], speed: 4, up: 1.6, gravity: 3, life: 1800, size: 0.22 });
          this.texts.add("BUT !", new THREE.Vector3(0, 3.6, GOAL_Z + 2), "#ffe58a", 1.4);
          this.shooter.cheer(2000);
        } else if (s.outcome === "arret") {
          this.fx.burst(s.to, { count: 12, colors: [0xffc83d, 0xffffff], speed: 2, life: 600 });
          this.texts.add("Arrêté !", new THREE.Vector3(0, 3.6, GOAL_Z + 2), "#ffffff", 1);
        } else if (s.outcome === "dessus") this.texts.add("Au-dessus…", new THREE.Vector3(0, 3.6, GOAL_Z + 2), "#ffffff", 1);
      }
    }
    // Le public sautille (encore plus après un but).
    const goal = s?.done && s.outcome === "but";
    this.stage.scene.traverse((o) => {
      if (o.userData.fan !== undefined) o.position.y = 3.4 + Math.floor((o.userData.fan as number) / 30) * 0.7 + Math.abs(Math.sin(now / (goal ? 120 : 400) + (o.userData.fan as number))) * (goal ? 0.4 : 0.08);
    });
    this.shooter.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
  }

  destroy(): void {
    this.shooter.dispose();
    this.stage.dispose();
  }
}
