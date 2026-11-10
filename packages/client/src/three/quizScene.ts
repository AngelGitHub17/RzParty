/**
 * Quiz entre amis en 3D : un plateau de jeu télévisé. La vedette de la question trône sous le projecteur,
 * les autres derrière leurs pupitres ; à la révélation, chacun rejoint le panneau de son pari
 * et la bonne réponse s'illumine.
 */
import { PLAYER_COLORS, type PublicPlayer, type QuizState } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, arc, label, studio, toon } from "./kit3d.ts";

const OPTION_COLORS = [0x2f7bef, 0xf0483e, 0x2db866, 0xf2b705];
const LETTERS = ["A", "B", "C", "D"];
const STAR_SPOT = new THREE.Vector3(0, 1.2, -3.2);

export class QuizScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly panels: THREE.Mesh[] = [];
  private readonly panelPos: THREE.Vector3[] = [];
  private readonly desks = new THREE.Group();
  private readonly bubbles = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private revealKey = "";
  private bubbleKey = "-";
  private right: number | null = null;

  constructor(host: HTMLElement, private readonly wide: boolean) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    scene.add(studio(0x1e2a6a, 9), this.desks, this.bubbles, this.fx.group, this.texts.group);
    // Estrade et projecteur de la vedette.
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.2, 32), toon(0xffc83d));
    podium.position.set(STAR_SPOT.x, 0.6, STAR_SPOT.z);
    const star = label("★", { scale: 0.9, width: 128, height: 128, color: "#ffe58a" });
    star.position.set(STAR_SPOT.x, 4.2, STAR_SPOT.z);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.set(STAR_SPOT.x, 4.2, STAR_SPOT.z);
    scene.add(podium, star, this.beam);
    // Les 4 panneaux de réponse.
    OPTION_COLORS.forEach((color, i) => {
      const at = new THREE.Vector3(-4.2 + i * 2.8, 0, 1.6);
      this.panelPos.push(at);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.8), toon(color));
      panel.position.copy(at).setY(0.12);
      const letter = label(LETTERS[i]!, { scale: 0.8, width: 128, height: 128, color: "#ffffff" });
      letter.position.copy(at).setY(1.2).setZ(at.z - 0.9);
      this.panels.push(panel);
      scene.add(panel, letter);
    });
    this.cast = new Cast(scene, { scale: 0.85, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, 4.6, portrait ? 14 : wide ? 8.6 : 9.6), new THREE.Vector3(0, 1.2, -0.8), true);
  }

  update(q: QuizState, players: PublicPlayer[]): void {
    const ids = Object.keys(q.scores).filter((id) => players.some((p) => p.id === id));
    const others = ids.filter((id) => id !== q.star);
    const deskSpots = arc(others.length, 5.6, Math.PI * 0.5, new THREE.Vector3(0, 0, -1.4)).map((p) => p.setZ(p.z - 4.2));
    const counts = new Map<number, number>();
    const spotOn = (opt: number) => {
      const k = counts.get(opt) ?? 0;
      counts.set(opt, k + 1);
      return this.panelPos[opt]!.clone().add(new THREE.Vector3(((k % 3) - 1) * 0.6, 0.25, Math.floor(k / 3) * 0.6 - 0.2));
    };
    this.cast.sync(players, ids, (id) => {
      if (id === q.star) return q.phase === "reveal" && q.starAnswer !== null ? spotOn(q.starAnswer) : STAR_SPOT.clone();
      if (q.phase === "reveal" && q.guesses && q.guesses[id] !== undefined) return spotOn(q.guesses[id]!);
      return deskSpots[others.indexOf(id)] ?? new THREE.Vector3();
    });
    this.cast.each((c) => c.face(new THREE.Vector3(c.group.position.x * 0.4, 0, 14)));
    // Pupitres devant les joueurs qui devinent.
    if (this.desks.children.length !== others.length) {
      for (const d of [...this.desks.children]) this.desks.remove(d);
      deskSpots.forEach((p) => {
        const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.5), toon(0xffffff));
        desk.position.copy(p).add(new THREE.Vector3(0, 0.4, 0.55));
        const buzzer = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xf0483e, { emissive: 0x500000 }));
        buzzer.position.copy(desk.position).setY(0.8);
        this.desks.add(desk, buzzer);
      });
    }
    // « ✔ » au-dessus de ceux qui ont répondu.
    const bubbleKey = q.phase === "answer" ? `${q.round}:${q.answered.join(",")}` : "";
    if (bubbleKey !== this.bubbleKey) {
      this.bubbleKey = bubbleKey;
      for (const b of [...this.bubbles.children] as THREE.Sprite[]) {
        this.bubbles.remove(b);
        b.material.map?.dispose();
        b.material.dispose();
      }
      if (q.phase === "answer") {
        for (const id of q.answered) {
          const c = this.cast.get(id);
          if (!c) continue;
          const b = label("✔", { scale: 0.45, width: 128, height: 128, color: "#8ff0a4" });
          b.userData.follow = c;
          this.bubbles.add(b);
        }
      }
    }
    // Révélation : la bonne réponse brille, ceux qui ont deviné sautent.
    this.right = q.phase === "reveal" ? q.starAnswer : null;
    const key = q.phase === "reveal" ? `${q.round}` : "";
    if (key && key !== this.revealKey) {
      this.revealKey = key;
      setTimeout(() => {
        if (q.starAnswer === null) return;
        const at = this.panelPos[q.starAnswer]!.clone().setY(1.6);
        this.fx.burst(at, { count: 34, colors: [0xffe58a, 0xffffff, OPTION_COLORS[q.starAnswer]!], speed: 3, life: 1400 });
        for (const [id, g] of Object.entries(q.guesses ?? {})) if (g === q.starAnswer) this.cast.get(id)?.cheer(1600);
        this.cast.get(q.star)?.cheer(1200);
      }, 900);
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    for (const b of this.bubbles.children) {
      const c = b.userData.follow as { group: THREE.Group } | undefined;
      if (c) b.position.copy(c.group.position).setY(c.group.position.y + 1.9 + Math.sin(now / 300) * 0.05);
    }
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(now / 400) * 0.04;
    this.panels.forEach((p, i) => {
      const m = p.material as THREE.MeshToonMaterial;
      m.emissive.setHex(this.right === i && Math.sin(now / 150) > 0 ? 0x666633 : 0x000000);
      p.position.y = 0.12 + (this.right === i ? Math.abs(Math.sin(now / 250)) * 0.08 : 0);
    });
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
