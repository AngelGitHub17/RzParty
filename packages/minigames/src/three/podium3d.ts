/**
 * Décor 3D des mini-jeux qui se jouent « à plat » (calcul, mémoire, couleurs…) : une petite scène
 * où chaque joueur se tient sur une colonne qui monte avec son score. Le premier porte une couronne,
 * ceux qui marquent sautent sous les confettis.
 */
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, studio, toon, type CastPlayer } from "./kit3d.ts";
import { ringColor } from "./players.ts";

const GAP = 1.6;

export class PodiumScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly columns = new Map<string, { mesh: THREE.Mesh; height: number; goal: number }>();
  private readonly crown: THREE.Sprite;
  private scores: Record<string, number> = {};
  private leader: string | null = null;

  constructor(host: HTMLElement, private readonly players: CastPlayer[], private readonly lowerIsBetter: boolean, theme: number) {
    this.stage = new Stage3D(host, { fov: 36 });
    const scene = this.stage.scene;
    const width = Math.max(4, players.length * GAP + 2);
    scene.add(studio(theme, width / 2 + 1.5));
    players.forEach((p, i) => {
      const x = (i - (players.length - 1) / 2) * GAP;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), toon(ringColor(p.color)));
      mesh.position.set(x, 0.2, 0);
      mesh.scale.y = 0.4;
      scene.add(mesh);
      this.columns.set(p.id, { mesh, height: 0.4, goal: 0.4 });
    });
    this.crown = label("👑", { scale: 0.6, width: 128, height: 128 });
    this.crown.visible = false;
    scene.add(this.crown, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.75, colorHex: ringColor, ring: false });
    this.cast.sync(players, players.map((p) => p.id), (_, i) => new THREE.Vector3((i - (players.length - 1) / 2) * GAP, 0.4, 0));
    this.stage.onTick((now, dt) => this.tick(now, dt));
        // Assez loin pour voir la plus haute colonne et son personnage, même dans un bandeau peu haut.
    const fitW = (width / 2 + 1) / Math.tan((36 * Math.PI) / 360) / Math.max(0.4, this.stage.aspect);
    this.stage.look(new THREE.Vector3(0, 2.6, Math.max(8.5, fitW)), new THREE.Vector3(0, 1.75, 0), true);
  }

  setScores(scores: Record<string, number>): void {
    const values = this.players.map((p) => scores[p.id] ?? 0);
    const played = values.filter((v) => v > 0);
    const max = Math.max(1, ...values);
    const min = played.length ? Math.min(...played) : 1;
    let best = -1;
    let leader: string | null = null;
    for (const p of this.players) {
      const v = scores[p.id] ?? 0;
      const before = this.scores[p.id] ?? 0;
      // Hauteur selon le score (ou l'inverse quand le plus petit gagne, ex. des millisecondes).
      const ratio = this.lowerIsBetter ? (v > 0 ? min / v : 0) : v / max;
      const col = this.columns.get(p.id);
      if (col) col.goal = 0.4 + ratio * 2.4;
      if (ratio > best && v !== 0) {
        best = ratio;
        leader = p.id;
      }
      const improved = this.lowerIsBetter ? before === 0 && v > 0 : v > before;
      if (improved && this.scores[p.id] !== undefined) {
        const c = this.cast.get(p.id);
        if (c) {
          c.cheer(900);
          const at = c.group.position.clone().setY(c.group.position.y + 1.4);
          if (!this.lowerIsBetter) this.texts.add(`+${v - before}`, at, "#8ff0a4", 0.5);
          this.fx.burst(at, { count: 10, colors: [ringColor(p.color) as number, 0xffffff], speed: 1.8, life: 600, size: 0.14 });
        }
      }
    }
    this.leader = leader;
    this.scores = { ...scores };
  }

  private tick(now: number, dt: number): void {
    for (const [id, col] of this.columns) {
      col.height += (col.goal - col.height) * Math.min(1, dt * 4);
      col.mesh.scale.y = col.height;
      col.mesh.position.y = col.height / 2;
      const c = this.cast.get(id);
      if (c && !c.moving) c.group.position.y = col.height;
    }
    const lead = this.leader ? this.cast.get(this.leader) : undefined;
    this.crown.visible = Boolean(lead);
    if (lead) this.crown.position.copy(lead.group.position).setY(lead.group.position.y + 1.6 + Math.sin(now / 300) * 0.06);
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
