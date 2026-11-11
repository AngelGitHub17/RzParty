/**
 * L'intrus en 3D : les joueurs alignés devant le mur des suspects (toises), sous les projecteurs.
 * Pendant le vote, une bulle « ? » au-dessus de chacun ; à la révélation, le projecteur se braque sur
 * l'intrus, qui enfile son masque, et les bons détectives sautent de joie.
 */
import { PLAYER_COLORS, type IntrusState, type PublicPlayer } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, toon } from "./kit3d.ts";

export class IntrusScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly spot: THREE.Mesh;
  private readonly spotLight: THREE.SpotLight;
  private readonly mask: THREE.Group;
  private revealKey = "";
  private target: string | null = null;
  private ids: string[] = [];
  private marks = new Map<string, THREE.Sprite>();

  constructor(host: HTMLElement, compact: boolean) {
    this.stage = new Stage3D(host, { fov: 38, background: 0x2a2f45 });
    const scene = this.stage.scene;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 7), toon(0x3c4260));
    floor.position.set(0, -0.1, 0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 0.2), toon(0xd9dde8));
    wall.position.set(0, 3, -2.2);
    scene.add(floor, wall);
    // Les toises du mur des suspects.
    for (let k = 0; k <= 8; k++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(16, k % 2 ? 0.03 : 0.06, 0.02), toon(0x3c4260));
      line.position.set(0, 0.5 + k * 0.5, -2.08);
      scene.add(line);
    }
    // Projecteur (cône lumineux) qui suit le joueur visé.
    this.spot = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 6, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.spot.position.set(0, 3, 0);
    this.spotLight = new THREE.SpotLight(0xfff3b0, 0, 14, 0.35, 0.5);
    this.spotLight.position.set(0, 7, 2);
    scene.add(this.spot, this.spotLight, this.spotLight.target, this.fx.group, this.texts.group);
    // Le masque de l'intrus (bandeau noir et yeux).
    this.mask = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.08, 8, 24), toon(0x14141c));
    band.rotation.x = Math.PI / 2;
    this.mask.add(band);
    this.mask.visible = false;
    scene.add(this.mask);
    this.cast = new Cast(scene, { scale: 1, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 3.4 : 2.4, portrait ? 12 : 6.2), new THREE.Vector3(0, 1.3, 0), true);
  }

  update(s: IntrusState, players: PublicPlayer[]): void {
    this.ids = Object.keys(s.scores).filter((id) => players.some((p) => p.id === id));
    const gap = Math.min(2.2, 12 / Math.max(1, this.ids.length));
    this.cast.sync(players, this.ids, (_, i) => new THREE.Vector3((i - (this.ids.length - 1) / 2) * gap, 0, 0));
    this.cast.each((c) => c.face(c.group.position.clone().add(new THREE.Vector3(0, 0, 5))));
    // Marques au-dessus des têtes : « ? » pendant le vote, ✔ quand on a voté, 🦹 à la révélation.
    for (const id of this.ids) {
      const text = s.phase === "vote" ? (s.voted.includes(id) ? "🗳️" : "?") : s.phase === "reveal" && s.reveal?.cheater === id ? "🦹" : "";
      const prev = this.marks.get(id);
      if (prev?.userData.text === text) continue;
      if (prev) {
        this.stage.scene.remove(prev);
        prev.material.map?.dispose();
        prev.material.dispose();
        this.marks.delete(id);
      }
      if (!text) continue;
      const m = label(text, { scale: 0.55, width: 128, height: 128, color: "#ffe58a" });
      m.userData.text = text;
      this.marks.set(id, m);
      this.stage.scene.add(m);
    }
    this.target = s.phase === "reveal" ? (s.reveal?.cheater ?? null) : null;
    const key = s.phase === "reveal" && s.reveal ? `${s.round}` : "";
    if (key && key !== this.revealKey) {
      this.revealKey = key;
      const r = s.reveal!;
      const c = this.cast.get(r.cheater);
      if (c) {
        this.fx.burst(c.group.position.clone().setY(2), { count: 30, colors: [0x9b5de5, 0x14141c, 0xffc83d], speed: 3, up: 1.4, gravity: 3, life: 1200, size: 0.25 });
        this.texts.add("C'était moi !", c.group.position.clone().setY(2.8), "#ffe58a", 0.6);
      }
      for (const [id, g] of Object.entries(r.gains)) {
        const ch = this.cast.get(id);
        if (!ch) continue;
        ch.cheer(2500);
        this.texts.add(`+${g}`, ch.group.position.clone().setY(2.4), "#7dffa0", 0.6);
      }
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    for (const [id, m] of this.marks) {
      const c = this.cast.get(id);
      if (c) m.position.copy(c.group.position).add(new THREE.Vector3(0, 2.25 + Math.sin(now / 300 + c.group.id) * 0.06, 0));
    }
    // Le projecteur balaie la file pendant le vote, puis se fixe sur l'intrus.
    const c = this.target ? this.cast.get(this.target) : undefined;
    const x = c ? c.group.position.x : Math.sin(now / 1400) * Math.min(5, this.ids.length * 0.9);
    this.spot.position.x += (x - this.spot.position.x) * Math.min(1, dt * (c ? 6 : 2));
    (this.spot.material as THREE.MeshBasicMaterial).opacity = c ? 0.28 : 0.14;
    this.spotLight.intensity = c ? 60 : 20;
    this.spotLight.target.position.set(this.spot.position.x, 0, 0);
    this.mask.visible = Boolean(c);
    if (c) this.mask.position.copy(c.group.position).add(new THREE.Vector3(0, 1.32, 0));
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
