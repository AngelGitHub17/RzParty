/**
 * Bingo des copains en 3D : la machine à boules qui tourne, la boule tirée qui roule jusqu'au plateau
 * avec le personnage dedans, les derniers tirés sur leurs socles et les joueurs qui guettent.
 */
import { PLAYER_COLORS, lotoMissing, normalizeAvatar, type LotoState, type PublicPlayer } from "@rzparty/shared";
import { Cast, Character3D, FloatTexts, Particles, Stage3D, THREE, arc, label, studio, toon } from "./kit3d.ts";

const DRUM = new THREE.Vector3(-2.6, 2.6, -0.5);
const TRAY = new THREE.Vector3(0.6, 0.75, 1.6);
const BALL_COLORS = [0xf0483e, 0x2f7bef, 0xffc83d, 0x2db866, 0x9257e8, 0xff8a1f, 0x18bdbd, 0xf45fae];

export class LotoScene {
  private readonly stage: Stage3D;
  private readonly drum = new THREE.Group();
  private readonly inner: { mesh: THREE.Mesh; a: number; b: number; s: number }[] = [];
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly history = new THREE.Group();
  private ball: { group: THREE.Group; char: Character3D | null; start: number } | null = null;
  private shownBall = -1;
  private historyKey = "";
  private historyChars: Character3D[] = [];
  private bingo = new Set<string>();
  private spin = 0;

  constructor(host: HTMLElement, private readonly wide: boolean) {
    this.stage = new Stage3D(host, { fov: 38 });
    const scene = this.stage.scene;
    scene.add(studio(0x5b3aa8, 8));

    // La machine : un tambour en fil doré sur un pied, rempli de boules colorées.
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, DRUM.y, 16), toon(0x3c3c46));
    stand.position.set(DRUM.x, DRUM.y / 2, DRUM.z);
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshBasicMaterial({ color: 0xffc83d, wireframe: true }));
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.55, 24, 16), toon(0xcfeaff, { transparent: true, opacity: 0.18 }));
    this.drum.add(cage, glass);
    for (let k = 0; k < 22; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), toon(BALL_COLORS[k % BALL_COLORS.length]!));
      this.drum.add(m);
      this.inner.push({ mesh: m, a: Math.random() * 10, b: Math.random() * 10, s: 0.6 + Math.random() * 0.8 });
    }
    this.drum.position.copy(DRUM);
    const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 16, 1, true), toon(0xffc83d));
    (chute.material as THREE.Material).side = THREE.DoubleSide;
    chute.rotation.z = Math.PI / 2.6;
    chute.position.set(DRUM.x + 1.6, 1.6, DRUM.z + 0.6);
    // Le plateau où la boule s'arrête.
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 0.3, 32), toon(0xffe58a));
    tray.position.set(TRAY.x, 0.15, TRAY.z);
    const title = label("BINGO", { scale: 0.9, width: 384, height: 128, color: "#ffc83d" });
    title.position.set(DRUM.x, DRUM.y + 2.3, DRUM.z);
    scene.add(stand, this.drum, chute, tray, title, this.history, this.fx.group, this.texts.group);

    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0.2, 3.6, portrait ? 12 : wide ? 7.6 : 8.4), new THREE.Vector3(0.2, 1.5, -0.4), true);
    this.cast = new Cast(scene, { scale: 0.85, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
  }

  update(l: LotoState, players: PublicPlayer[]): void {
    const ids = Object.keys(l.choice).filter((id) => players.some((p) => p.id === id));
    const spots = arc(ids.length, 6, Math.PI * 0.55, new THREE.Vector3(1.5, 0, -2.2)).map((p) => p.setZ(p.z - 3.4));
    this.cast.sync(players, ids, (_, i) => spots[i]!);
    this.cast.each((c) => c.face(new THREE.Vector3(TRAY.x, 0, TRAY.z + 3)));
    // Bingo : le gagnant saute de joie sous les confettis.
    for (const id of ids) {
      const marked = l.marked[id];
      if (marked && lotoMissing(marked) === 0 && !this.bingo.has(id)) {
        this.bingo.add(id);
        const c = this.cast.get(id);
        if (c) {
          c.cheer(4000);
          this.fx.burst(c.group.position.clone().setY(1.6), { count: 50, colors: BALL_COLORS, speed: 4, up: 1.6, gravity: 3, life: 2000, size: 0.22 });
          this.texts.add("BINGO !", c.group.position.clone().setY(2.4), "#ffc83d", 1);
        }
      }
    }
    if (l.phase === "choose") return;
    if (l.ballId !== this.shownBall) {
      this.shownBall = l.ballId;
      if (l.ball) this.drawBall(l);
    }
    // Les derniers personnages tirés, sur leurs socles.
    const last = l.drawn.slice(-6, l.ball?.kind === "perso" ? -1 : undefined).slice(-5);
    const key = last.join(",");
    if (key !== this.historyKey) {
      this.historyKey = key;
      for (const c of this.historyChars) {
        this.history.remove(c.group);
        c.dispose();
      }
      for (const m of [...this.history.children]) this.history.remove(m);
      this.historyChars = last.map((n, i) => {
        const x = 2.6 + (i % 3) * 1.1;
        const z = -0.6 + Math.floor(i / 3) * 1.2;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.4, 20), toon(0xffffff));
        base.position.set(x, 0.2, z);
        this.history.add(base);
        const c = new Character3D(normalizeAvatar(l.pool[n]), { scale: 0.5 });
        c.place(new THREE.Vector3(x, 0.4, z));
        this.history.add(c.group);
        return c;
      });
    }
  }

  /** Une boule sort de la machine et roule jusqu'au plateau. */
  private drawBall(l: LotoState): void {
    if (this.ball) {
      this.stage.scene.remove(this.ball.group);
      this.ball.char?.dispose();
    }
    const group = new THREE.Group();
    const mini = l.ball!.kind === "minijeu";
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 20), toon(mini ? 0xffc83d : 0xcfeaff, { transparent: !mini, opacity: 0.35 }));
    shell.position.y = 0.75;
    group.add(shell);
    let char: Character3D | null = null;
    if (mini) {
      const tag = label("Mini-jeu !", { scale: 0.6, width: 384, height: 96, color: "#ffffff" });
      tag.position.y = 1.9;
      group.add(tag);
    } else if (l.ball!.kind === "perso") {
      char = new Character3D(normalizeAvatar(l.pool[l.ball!.index]), { scale: 0.5 });
      char.place(new THREE.Vector3(0, 0.25, 0));
      group.add(char.group);
    }
    group.position.copy(DRUM).setY(1.6);
    this.stage.scene.add(group);
    this.ball = { group, char, start: performance.now() };
    this.spin = 1;
  }

  private tick(now: number, dt: number): void {
    // Le tambour tourne (plus vite juste après un tirage).
    this.spin = Math.max(0.15, this.spin - dt * 0.4);
    this.drum.rotation.z += dt * this.spin * 3;
    this.drum.rotation.y += dt * 0.4;
    for (const b of this.inner) {
      const t = now / 1000;
      b.mesh.position.set(Math.sin(t * b.s + b.a) * 1.1, Math.cos(t * b.s * 1.3 + b.b) * 1.1, Math.sin(t * b.s * 0.7 + b.b) * 0.9);
    }
    if (this.ball) {
      const t = Math.min(1, (now - this.ball.start) / 1300);
      const ease = 1 - Math.pow(1 - t, 3);
      const from = DRUM.clone().setY(1.6);
      const to = TRAY.clone().setY(0.3);
      this.ball.group.position.lerpVectors(from, to, ease);
      this.ball.group.position.y += Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 0.8;
      this.ball.group.rotation.y = (1 - ease) * 6;
      if (t >= 1 && !this.ball.group.userData.landed) {
        this.ball.group.userData.landed = true;
        this.fx.burst(to.clone().setY(1.5), { count: 22, colors: BALL_COLORS, speed: 2.5, life: 900 });
        this.ball.char?.cheer(1200);
      }
      this.ball.char?.tick(now);
    }
    for (const c of this.historyChars) c.tick(now);
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
  }

  destroy(): void {
    this.ball?.char?.dispose();
    for (const c of this.historyChars) c.dispose();
    this.cast.dispose();
    this.stage.dispose();
  }
}
