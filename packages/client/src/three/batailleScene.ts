/**
 * Bataille en 3D : deux équipes de part et d'autre d'une flaque de boue, une corde tendue, un foulard
 * au milieu et des marques de victoire de chaque côté. Après chaque manche, l'équipe gagnante tire :
 * tout le monde glisse d'un cran, les gagnants sautent de joie, et la boue éclabousse.
 */
import { BATAILLE_TEAMS, PLAYER_COLORS, type BatailleState, type PublicPlayer } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, cloud, label, toon, tree } from "./kit3d.ts";

/** Longueur d'un cran sur la corde. */
const STEP = 0.9;

export class BatailleScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly rope = new THREE.Group();
  private readonly flag: THREE.Mesh;
  private ropeX = 0;
  private goalMarks: THREE.Object3D[] = [];
  private goal = 0;
  private lastKey = "";
  private pullUntil = 0;
  private pullDir = 0;

  constructor(host: HTMLElement, compact: boolean) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    const grass = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 14), toon(0x7ed957));
    grass.position.y = -0.2;
    const mud = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.05, 32), toon(0x7a4a22));
    mud.scale.set(1, 1, 0.7);
    mud.position.y = 0.02;
    scene.add(grass, mud);
    // Tribunes de chaque équipe (couleur de l'équipe).
    BATAILLE_TEAMS.forEach((team, i) => {
      const side = i === 0 ? -1 : 1;
      const banner = label(`${team.emoji} ${team.label}`, { scale: 0.7, width: 512, height: 110, color: "#ffffff", outline: team.hex });
      banner.position.set(side * 6, 3.4, -2.5);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), toon(0xffffff));
      pole.position.set(side * 8.6, 1.7, -2.5);
      const pennant = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 3), toon(team.hex));
      pennant.rotation.z = side * -Math.PI / 2;
      pennant.position.set(side * 8.6 - side * 0.6, 3, -2.5);
      scene.add(banner, pole, pennant);
    });
    for (const [x, z] of [[-11, -4], [11, -4], [-13, 1], [13, 1]] as const) {
      const t = tree(1.3);
      t.position.set(x, 0, z);
      scene.add(t);
    }
    for (let k = 0; k < 4; k++) {
      const c = cloud(1);
      c.position.set(-10 + k * 7, 7, -8);
      scene.add(c);
    }
    // La corde et son foulard.
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 16, 8), toon(0xd8c39a));
    cord.rotation.z = Math.PI / 2;
    cord.position.y = 0.9;
    this.flag = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 4), toon(0xf0483e));
    this.flag.rotation.x = Math.PI;
    this.flag.position.y = 0.55;
    this.rope.add(cord, this.flag);
    scene.add(this.rope, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.9, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 6 : 3.4, portrait ? 15 : compact ? 8.5 : 7.8), new THREE.Vector3(0, 1.1, 0), true);
  }

  update(b: BatailleState, players: PublicPlayer[]): void {
    // Marques de victoire : quand le foulard les atteint, l'équipe gagne.
    if (b.goal !== this.goal) {
      this.goal = b.goal;
      for (const m of this.goalMarks) this.stage.scene.remove(m);
      this.goalMarks = [-1, 1].map((side, i) => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 3), toon(BATAILLE_TEAMS[i]!.hex));
        line.position.set(side * b.goal * STEP, 0.03, 0);
        this.stage.scene.add(line);
        return line;
      });
    }
    const ids = [...b.teams[0], ...b.teams[1]].filter((id) => players.some((p) => p.id === id));
    this.cast.sync(players, ids);
    this.ropeTarget(b);
    const key = b.last ? `${b.round}` : "";
    if (key && key !== this.lastKey) {
      this.lastKey = key;
      if (b.last!.winner !== null) {
        this.pullDir = b.last!.winner === 0 ? -1 : 1;
        this.pullUntil = performance.now() + 1400;
        for (const id of b.teams[b.last!.winner]) this.cast.get(id)?.cheer(1800);
        const at = new THREE.Vector3(b.rope * STEP, 0.4, 0);
        this.fx.burst(at, { count: 30, colors: [0x7a4a22, 0x5c3415, 0x9a6542], speed: 2.5, up: 1.4, gravity: 5, life: 900, size: 0.22 });
        this.texts.add(`${BATAILLE_TEAMS[b.last!.winner]!.emoji} tire !`, at.clone().setY(2.6), BATAILLE_TEAMS[b.last!.winner]!.hex, 0.7);
      } else this.texts.add("Égalité !", new THREE.Vector3(b.rope * STEP, 2.6, 0), "#ffffff", 0.7);
    }
  }

  /** Place chaque équipe le long de la corde, derrière le foulard. */
  private ropeTarget(b: BatailleState): void {
    this.ropeX = b.rope * STEP;
    b.teams.forEach((team, t) => {
      const side = t === 0 ? -1 : 1;
      team.forEach((id, i) => {
        const c = this.cast.get(id);
        if (!c) return;
        c.goTo(new THREE.Vector3(this.ropeX + side * (2.4 + i * 1.3), 0, i % 2 ? 0.35 : -0.35));
        c.face(new THREE.Vector3(this.ropeX, 0, 0));
      });
    });
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    this.rope.position.x += (this.ropeX - this.rope.position.x) * Math.min(1, dt * 3);
    // Tout le monde tire en se penchant en arrière ; plus fort pendant une victoire.
    const pulling = now < this.pullUntil;
    this.cast.each((c) => {
      const side = Math.sign(c.group.position.x - this.rope.position.x) || 1;
      c.group.rotation.z = side * (0.12 + (pulling ? 0.12 : 0.03) * Math.abs(Math.sin(now / 160 + c.group.id)));
    });
    this.rope.position.y = Math.sin(now / 90) * (pulling ? 0.05 : 0.015);
    this.flag.rotation.y += dt * 2;
    if (pulling && Math.random() < 0.2) this.fx.burst(new THREE.Vector3(this.rope.position.x + this.pullDir * 2, 0.2, 0), { count: 2, colors: [0x7a4a22], speed: 1, up: 1, gravity: 4, life: 600 });
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
