/**
 * Bombe à mots en 3D : les joueurs en cercle autour d'un feu de camp, la bombe qui passe de main en main
 * (sa mèche crépite de plus en plus vite), la catégorie qui flotte au milieu, et le BOUM.
 */
import { PLAYER_COLORS, type MotsState, type PublicPlayer } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, toon, tree } from "./kit3d.ts";

const RING = 4.2;

export class MotsScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly bomb = new THREE.Group();
  private readonly bombBody: THREE.Mesh;
  private readonly spark: THREE.Mesh;
  private category: THREE.Sprite | null = null;
  private categoryText = "";
  private holder: string | null = null;
  private from = new THREE.Vector3();
  private passAt = 0;
  private heat = 0;
  private boomKey = "";
  private sparkAt = 0;
  private fireAt = 0;
  private phase: MotsState["phase"] = "play";
  private wordKey = "";

  constructor(host: HTMLElement, private readonly wide: boolean) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), toon(0x6fae3f));
    ground.rotation.x = -Math.PI / 2;
    const clearing = new THREE.Mesh(new THREE.CircleGeometry(6, 40), toon(0xc9a36b));
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.y = 0.01;
    scene.add(ground, clearing);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const t = tree(1.2 + (k % 3) * 0.3, k % 2 ? 0x2f9a44 : 0x3fae49);
      t.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9);
      scene.add(t);
    }
    // Feu de camp.
    for (let k = 0; k < 5; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 8), toon(0x7a4a22));
      log.rotation.set(Math.PI / 2.3, (k / 5) * Math.PI * 2, 0);
      log.position.y = 0.2;
      scene.add(log);
    }
    // La bombe : boule noire, mèche, étincelle.
    this.bombBody = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), toon(0x1e2230));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12), toon(0x5c6370));
    cap.position.y = 0.44;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), toon(0xd8c39a));
    fuse.position.set(0.05, 0.62, 0);
    fuse.rotation.z = -0.3;
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(0xffc83d, { emissive: 0xff8a1f }));
    this.spark.position.set(0.1, 0.78, 0);
    this.bomb.add(this.bombBody, cap, fuse, this.spark);
    scene.add(this.bomb, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.9, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 14 : 9.5, portrait ? 11 : wide ? 7.5 : 8.5), new THREE.Vector3(0, 0.6, 0.4), true);
  }

  update(m: MotsState, players: PublicPlayer[]): void {
    this.phase = m.phase;
    this.heat = m.heat;
    const ids = Object.keys(m.booms).filter((id) => players.some((p) => p.id === id));
    this.cast.sync(players, ids, (_, i) => {
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2;
      return new THREE.Vector3(Math.sin(a) * RING, 0, Math.cos(a) * RING);
    });
    this.cast.each((c) => c.face(new THREE.Vector3(0, 0, 0)));
    if (m.category !== this.categoryText) {
      this.categoryText = m.category;
      if (this.category) {
        this.stage.scene.remove(this.category);
        this.category.material.map?.dispose();
        this.category.material.dispose();
      }
      this.category = label(m.category, { scale: 0.75, width: 640, height: 128, color: "#ffe58a" });
      this.category.position.set(0, 3.1, 0);
      this.stage.scene.add(this.category);
    }
    // La bombe change de main : elle vole de l'un à l'autre.
    if (m.holder !== this.holder) {
      this.from.copy(this.bomb.position);
      this.passAt = performance.now();
      this.holder = m.holder;
    }
    // Mot proposé : il s'envole au-dessus du porteur.
    const wordKey = m.pending ? `${m.holder}:${m.pending.word}:${m.pending.spoken}` : "";
    if (wordKey && wordKey !== this.wordKey) {
      const c = m.holder ? this.cast.get(m.holder) : undefined;
      if (c) this.texts.add(m.pending!.spoken ? "🗣️" : `« ${m.pending!.word} »`, c.group.position.clone().setY(2.5), "#ffffff", 0.6);
    }
    this.wordKey = wordKey;
    // BOUM !
    const boomKey = m.phase === "boom" && m.blast ? `${m.blast.playerId}:${m.blast.at}` : "";
    if (boomKey && boomKey !== this.boomKey) {
      this.boomKey = boomKey;
      const c = this.cast.get(m.blast!.playerId);
      const at = (c?.group.position ?? new THREE.Vector3()).clone().setY(1.6);
      this.fx.burst(at, { count: 60, colors: [0xff6a1f, 0xffc83d, 0xd63a00, 0x3c3c46], speed: 5, up: 1.2, gravity: 4, life: 1400, size: 0.4 });
      this.fx.burst(at, { count: 20, colors: [0x5c6370, 0x8f8a80], speed: 1.2, up: 1.5, gravity: -0.5, life: 2200, size: 0.8 });
      this.texts.add("BOUM !", at.clone().setY(2.6), "#ff8a1f", 1.1);
      c?.cheer(1200);
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    // Le feu crépite.
    if (now - this.fireAt > 120) {
      this.fireAt = now;
      this.fx.burst(new THREE.Vector3(0, 0.4, 0), { count: 2, colors: [0xff6a1f, 0xffc83d], speed: 0.4, up: 1.6, gravity: -0.8, life: 800, size: 0.3, spread: 0.4 });
    }
    // La bombe au-dessus de la tête du porteur (cachée pendant l'explosion).
    const c = this.holder ? this.cast.get(this.holder) : undefined;
    this.bomb.visible = Boolean(c) && this.phase === "play";
    if (c) {
      const target = c.group.position.clone().setY(c.group.position.y + 2);
      const t = Math.min(1, (now - this.passAt) / 450);
      this.bomb.position.lerpVectors(this.from, target, t);
      this.bomb.position.y += Math.sin(t * Math.PI) * 1.2;
    }
    // Plus elle chauffe, plus elle gonfle et rougit.
    const beat = Math.sin(now / (this.heat === 2 ? 70 : this.heat === 1 ? 140 : 260));
    this.bombBody.scale.setScalar(1 + beat * (0.03 + this.heat * 0.04));
    (this.bombBody.material as THREE.MeshToonMaterial).emissive.setHex(this.heat === 2 && beat > 0 ? 0x7a1000 : this.heat === 1 && beat > 0.5 ? 0x3a0800 : 0x000000);
    this.spark.scale.setScalar(0.8 + Math.random() * 0.6);
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
