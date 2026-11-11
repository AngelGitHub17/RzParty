/**
 * Parcours solo en 3D : un chemin de plateformes numérotées qui serpente en montant vers une coupe.
 * Les joueurs se tiennent sur la dernière étape franchie ; les bots adversaires attendent sur l'étape
 * à jouer, qui brille. Une étape franchie fait sauter le joueur sur la suivante, une vie perdue fait
 * tomber un cœur.
 */
import { PLAYER_COLORS, type PublicPlayer, type SoloState } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, cloud, textDisc, toon, tree } from "./kit3d.ts";

const LEVEL_COLOR = { facile: 0x3dbe5b, moyen: 0xffc83d, difficile: 0xf0483e } as const;

export class SoloScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private pads: THREE.Mesh[] = [];
  private spots: THREE.Vector3[] = [];
  private stages = 0;
  private current = 0;
  private trophy = new THREE.Group();
  private seen = "";

  constructor(host: HTMLElement, private readonly compact: boolean) {
    this.stage = new Stage3D(host, { fov: 42 });
    const scene = this.stage.scene;
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 0.4, 48), toon(0x8cc63f));
    ground.position.y = -0.2;
    scene.add(ground);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const t = tree(1 + (k % 3) * 0.3);
      t.position.set(Math.cos(a) * 15, 0, Math.sin(a) * 11 - 3);
      scene.add(t);
    }
    for (let k = 0; k < 5; k++) {
      const c = cloud(1.2);
      c.position.set(-14 + k * 7, 11 + (k % 2), -12);
      scene.add(c);
    }
    // La coupe au sommet.
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.25, 0.8, 20), toon(0xffc83d, { emissive: 0x6a4a00 }));
    cup.position.y = 1.0;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 16), toon(0xc99a1d));
    foot.position.y = 0.45;
    this.trophy.add(cup, foot);
    scene.add(this.trophy, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.75, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
  }

  /** Construit le chemin : départ + une plateforme par étape, en zigzag et en montée. */
  private build(stages: number): void {
    for (const p of this.pads) this.stage.scene.remove(p);
    this.pads = [];
    this.spots = [];
    this.stages = stages;
    for (let i = 0; i <= stages; i++) {
      const t = i / stages;
      const x = Math.sin(t * Math.PI * 2.2) * 6;
      const z = 5 - t * 14;
      const y = t * 2.2;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.5 + y, 24), toon(i === 0 ? 0xffffff : 0xe9d3a3));
      pad.position.set(x, (0.5 + y) / 2, z);
      this.stage.scene.add(pad);
      if (i > 0) {
        const num = textDisc(String(i), 0.75, { color: "#1e2a4a", bg: "#ffffff" });
        num.position.set(x, 0.5 + y + 0.02, z + 0.55);
        num.scale.setScalar(0.6);
        pad.attach(num);
      }
      this.pads.push(pad);
      this.spots.push(new THREE.Vector3(x, 0.5 + y, z));
    }
    const last = this.spots[stages]!;
    this.trophy.position.set(last.x, last.y, last.z - 0.9);
  }

  update(s: SoloState, players: PublicPlayer[]): void {
    if (s.stages !== this.stages) this.build(s.stages);
    this.current = s.stage;
    this.pads.forEach((pad, i) => {
      const m = pad.material as THREE.MeshToonMaterial;
      m.emissive.setHex(i === s.stage ? 0x3a3000 : 0x000000);
      if (i > 0 && i <= s.stages) m.color.setHex(i < s.stage ? 0xbfe6a0 : i === s.stage ? LEVEL_COLOR[s.level] : 0xe9d3a3);
    });
    const humans = Object.keys(s.progress).filter((id) => players.some((p) => p.id === id));
    const bots = players.filter((p) => p.isBot).map((p) => p.id);
    this.cast.sync(players, [...humans, ...bots]);
    humans.forEach((id, i) => {
      const at = this.spots[Math.min(s.stages, s.progress[id] ?? 0)]!.clone().add(new THREE.Vector3((i - (humans.length - 1) / 2) * 0.7, 0, 0.3));
      const c = this.cast.get(id);
      c?.goTo(at);
      // Plus de vies : il reste assis au départ, grisé.
      if (c) c.group.visible = (s.lives[id] ?? 0) > 0 || (s.progress[id] ?? 0) > 0;
    });
    // Les bots attendent sur l'étape à jouer.
    const target = this.spots[Math.min(s.stages, s.stage)]!;
    bots.forEach((id, i) => this.cast.get(id)?.goTo(target.clone().add(new THREE.Vector3((i - (bots.length - 1) / 2) * 0.7, 0, -0.5))));
    // Étape franchie / vie perdue : petites fêtes et cœurs brisés.
    const key = JSON.stringify(s.last) + s.stage;
    if (s.last && key !== this.seen) {
      this.seen = key;
      for (const id of s.last.passed) {
        const c = this.cast.get(id);
        if (!c) continue;
        c.cheer(1600);
        this.fx.burst(c.destination.clone().setY(c.destination.y + 1.2), { count: 24, colors: [0xffc83d, 0x3dbe5b, 0xffffff], speed: 2.5, up: 1.4, gravity: 3, life: 1100, size: 0.22 });
      }
      for (const id of s.last.failed) {
        const c = this.cast.get(id);
        if (c) this.texts.add("💔", c.destination.clone().setY(c.destination.y + 2), "#ff6a5e", 0.7);
      }
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    this.trophy.rotation.y += dt * 0.8;
    // La caméra regarde l'étape à jouer, un peu en surplomb.
    const at = this.spots[Math.min(this.stages, this.current)] ?? new THREE.Vector3();
    const portrait = this.stage.aspect < 1;
    this.stage.look(at.clone().add(new THREE.Vector3(0, portrait ? 9 : this.compact ? 6.5 : 6, portrait ? 13 : this.compact ? 10 : 9)), at.clone().add(new THREE.Vector3(0, 0.5, -1.5)));
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
