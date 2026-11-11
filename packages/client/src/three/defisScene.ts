/**
 * Défis en 3D : l'équipe des humains face aux bots, chacun sur son estrade, sous un grand tableau
 * d'affichage (score et multiplicateur). Les cœurs de l'équipe flottent au-dessus d'elle ; un défi
 * réussi fait jaillir des confettis côté humains, un défi raté fait éclater un cœur.
 */
import { PLAYER_COLORS, type DefisState, type PublicPlayer } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, toon } from "./kit3d.ts";

export class DefisScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly hearts: THREE.Mesh[] = [];
  private board: THREE.Sprite | null = null;
  private boardKey = "";
  private seen = "";

  constructor(host: HTMLElement, compact: boolean) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.4, 48), toon(0x7ed0ff));
    floor.position.y = -0.2;
    scene.add(floor);
    for (const [x, color] of [[-3.2, 0x3dbe5b], [3.2, 0x5c6370]] as const) {
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.5, 32), toon(color));
      dais.position.set(x, 0.25, 0);
      scene.add(dais);
    }
    const vs = label("VS", { scale: 0.9, width: 256, height: 160, color: "#ffffff", outline: "#f0483e" });
    vs.position.set(0, 1.4, 0.5);
    scene.add(vs, this.fx.group, this.texts.group);
    // Les cœurs de l'équipe (pleins ou vides).
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, 0.25);
    heartShape.bezierCurveTo(0, 0.5, -0.45, 0.5, -0.45, 0.2);
    heartShape.bezierCurveTo(-0.45, -0.05, -0.15, -0.2, 0, -0.4);
    heartShape.bezierCurveTo(0.15, -0.2, 0.45, -0.05, 0.45, 0.2);
    heartShape.bezierCurveTo(0.45, 0.5, 0, 0.5, 0, 0.25);
    const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    for (let i = 0; i < 5; i++) {
      const h = new THREE.Mesh(heartGeo, toon(0xf0483e));
      h.visible = false;
      scene.add(h);
      this.hearts.push(h);
    }
    this.cast = new Cast(scene, { scale: 0.95, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 6 : 3.6, portrait ? 15 : compact ? 9 : 8.4), new THREE.Vector3(0, 1.6, 0), true);
  }

  update(d: DefisState, players: PublicPlayer[]): void {
    const humans = players.filter((p) => !p.isBot).map((p) => p.id);
    const bots = players.filter((p) => p.isBot).map((p) => p.id);
    this.cast.sync(players, [...humans, ...bots], (id) => {
      const team = humans.includes(id) ? humans : bots;
      const i = team.indexOf(id);
      const side = humans.includes(id) ? -3.2 : 3.2;
      return new THREE.Vector3(side + (i - (team.length - 1) / 2) * 1.1, 0.5, (i % 2) * 0.5);
    });
    this.cast.each((c) => c.face(new THREE.Vector3(0, 0, 4)));
    // Tableau d'affichage.
    const key = `${d.score}|${d.streak}|${d.phase}|${d.place}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      if (this.board) {
        this.stage.scene.remove(this.board);
        this.board.material.map?.dispose();
        this.board.material.dispose();
      }
      const text = d.phase === "done" ? (d.place === 0 ? `🏆 ${d.score} — RECORD !` : `Score final : ${d.score}`) : `${d.score} pts · ×${String(1 + d.streak * 0.5).replace(".", ",")}`;
      this.board = label(text, { scale: 1, width: 640, height: 128, color: "#ffe58a", bg: "#1e2a4aee", outline: "#1e2a4a" });
      this.board.position.set(0, 4.3, -1);
      this.stage.scene.add(this.board);
    }
    this.hearts.forEach((h, i) => {
      h.visible = i < d.maxHearts;
      (h.material as THREE.MeshToonMaterial).color.setHex(i < d.hearts ? 0xf0483e : 0x5c6370);
    });
    const seen = d.last ? `${d.round}:${d.last.ok}` : "";
    if (seen && seen !== this.seen) {
      this.seen = seen;
      if (d.last!.ok) {
        for (const id of d.last!.ahead) this.cast.get(id)?.cheer(1800);
        this.fx.burst(new THREE.Vector3(-3.2, 2.5, 0), { count: 50, colors: [0xffc83d, 0x3dbe5b, 0xf45fae, 0x3d8bff], speed: 4, up: 1.4, gravity: 3, life: 1500, size: 0.28 });
        this.texts.add(`+${d.last!.points}`, new THREE.Vector3(-3.2, 3.4, 0), "#ffe58a", 0.9);
      } else {
        const lost = this.hearts[d.hearts];
        if (lost) this.fx.burst(lost.position.clone(), { count: 20, colors: [0xf0483e, 0xffffff], speed: 2.5, up: 1, gravity: 4, life: 900, size: 0.2 });
        for (const id of bots) this.cast.get(id)?.cheer(1500);
        this.texts.add("💔", new THREE.Vector3(-3.2, 3.4, 0), "#ff6a5e", 0.9);
      }
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    const shown = this.hearts.filter((h) => h.visible).length;
    this.hearts.forEach((h, i) => {
      h.position.set(-3.2 + (i - (shown - 1) / 2) * 1.05, 3.1 + Math.sin(now / 400 + i) * 0.08, 0.6);
      h.rotation.y = Math.sin(now / 700 + i) * 0.4;
      h.scale.setScalar(0.85);
    });
    if (this.board) this.board.position.y = 4.3 + Math.sin(now / 900) * 0.05;
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
