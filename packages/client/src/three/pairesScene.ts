/**
 * Paires cachées en 3D : 24 personnages en tenue sombre sur une place pavée. On en touche un pour
 * révéler sa couleur ; les paires trouvées prennent la couleur du joueur ; ceux qui ont bougé sautent.
 */
import { PLAYER_COLORS, normalizeAvatar, type PairesState, type PublicPlayer } from "@rzparty/shared";
import { Cast, Character3D, FloatTexts, Particles, Stage3D, THREE, label, toon } from "./kit3d.ts";

const COLS = 6;
const GAP_X = 1.35;
const GAP_Z = 1.45;

interface Spot {
  char: Character3D;
  key: string;
  base: THREE.Mesh;
  question: THREE.Sprite;
  hit: THREE.Mesh;
}

export class PairesScene {
  private readonly stage: Stage3D;
  private readonly grid = new THREE.Group();
  private readonly spots: (Spot | undefined)[] = [];
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private resultKey = "";
  private movedKey = "";

  constructor(host: HTMLElement, private readonly onFlip: (card: number) => void) {
    this.stage = new Stage3D(host, { fov: 38 });
    const scene = this.stage.scene;
    // La place : pavés clairs et fontaine au fond.
    const plaza = new THREE.Mesh(new THREE.BoxGeometry(COLS * GAP_X + 2.4, 0.3, 4 * GAP_Z + 3.4), toon(0xe9d7a8));
    plaza.position.y = -0.15;
    const grass = new THREE.Mesh(new THREE.CircleGeometry(30, 48), toon(0x8cc63f));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.31;
    const fountain = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.5, 32), toon(0xd8dde4));
    basin.position.y = 0.25;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.05, 32), toon(0x7fd3ff));
    water.position.y = 0.48;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 12), toon(0xd8dde4));
    pillar.position.y = 0.9;
    fountain.add(basin, water, pillar);
    fountain.position.set(0, 0, -(2 * GAP_Z + 3.2));
    scene.add(grass, plaza, fountain, this.grid, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.8, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    let lastSplash = 0;
    this.stage.onTick((now, dt) => {
      if (now - lastSplash > 260) {
        lastSplash = now;
        this.fx.burst(new THREE.Vector3(fountain.position.x, 1.6, fountain.position.z), { count: 2, colors: [0x7fd3ff, 0xffffff], speed: 1, up: 1.4, gravity: 5, life: 700, size: 0.14 });
      }
      this.tick(now, dt);
    });
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 15 : 10.5, portrait ? 10 : 8.5), new THREE.Vector3(0, 0, 0.4), true);
  }

  private posOf(i: number, count: number): THREE.Vector3 {
    const rows = Math.ceil(count / COLS);
    return new THREE.Vector3(((i % COLS) - (COLS - 1) / 2) * GAP_X, 0, (Math.floor(i / COLS) - (rows - 1) / 2) * GAP_Z);
  }

  update(s: PairesState, players: PublicPlayer[], mine: boolean): void {
    this.stage.clearPicks();
    s.cards.forEach((c, i) => {
      const open = c.found === null && s.flipped.includes(i);
      const key = `${JSON.stringify(c.avatar)}:${c.color}`;
      let spot = this.spots[i];
      if (!spot || spot.key !== key) {
        if (spot) {
          this.grid.remove(spot.char.group, spot.base, spot.question, spot.hit);
          spot.char.dispose();
        }
        const at = this.posOf(i, s.cards.length);
        const char = new Character3D(normalizeAvatar(c.avatar), { scale: 0.55 });
        char.place(at.clone().setY(0.2));
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.2, 24), toon(0xffffff));
        base.position.copy(at).setY(0.1);
        const question = label("?", { scale: 0.45, width: 128, height: 128 });
        question.position.copy(at).setY(1.4);
        // Zone de toucher large (doigt au téléphone).
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.position.copy(at).setY(0.7);
        this.grid.add(base, char.group, question, hit);
        spot = { char, key, base, question, hit };
        this.spots[i] = spot;
        // Personnage qui vient d'être retourné : il saute.
        if (open) {
          char.cheer(700);
          this.fx.burst(at.clone().setY(1.2), { count: 10, colors: [0xffffff, 0xffe58a], speed: 1.6, life: 600 });
        }
      }
      const finder = c.found ? players.find((p) => p.id === c.found) : undefined;
      (spot.base.material as THREE.MeshToonMaterial).color.set(finder ? (PLAYER_COLORS[finder.color]?.hex ?? 0xffffff) : open ? 0xffe58a : 0xffffff);
      spot.question.visible = c.color === null;
      spot.char.group.scale.setScalar(c.found ? 0.75 : 1);
      if (mine && c.found === null && !open) this.stage.pick(spot.hit, () => this.onFlip(i));
    });
    // Paire ou raté : confettis ou croix rouge.
    const resultKey = s.phase === "show" ? `${s.flipped.join(",")}:${s.last}:${s.tour}` : "";
    if (resultKey && resultKey !== this.resultKey) {
      this.resultKey = resultKey;
      for (const i of s.flipped) {
        const at = this.posOf(i, s.cards.length).setY(1.5);
        if (s.last === "paire") this.fx.burst(at, { count: 26, colors: [0xf0483e, 0x2f7bef, 0xffc83d, 0x2db866], speed: 3, life: 1200 });
        else this.texts.add("✘", at, "#ff6b5e", 0.8);
      }
      if (s.last === "paire") this.cast.get(s.turn ?? "")?.cheer(1500);
    }
    // Personnages qui ont changé de place : ils sautent.
    const moved = s.cards.map((c, i) => (c.moved ? i : -1)).filter((i) => i >= 0);
    const movedKey = moved.join(",");
    if (movedKey && movedKey !== this.movedKey) {
      for (const i of moved) {
        this.spots[i]?.char.cheer(1200);
        this.texts.add("↔", this.posOf(i, s.cards.length).setY(1.7), "#ffe58a", 0.7);
      }
    }
    this.movedKey = movedKey;
    // Les joueurs regardent la place depuis le bord ; celui qui joue s'avance.
    const ids = Object.keys(s.scores).filter((id) => players.some((p) => p.id === id));
    const half = 4 * GAP_Z / 2 + 1.6;
    this.cast.sync(players, ids, (id, i) => new THREE.Vector3((i - (ids.length - 1) / 2) * 1.4, 0, half + (id === s.turn ? 0 : 0.9)));
    this.cast.each((c) => c.face(new THREE.Vector3(c.group.position.x, 0, -10)));
  }

  private tick(now: number, dt: number): void {
    for (const s of this.spots) {
      if (!s) continue;
      s.char.tick(now);
      s.question.position.y = 1.4 + Math.sin(now / 400 + s.base.position.x) * 0.06;
    }
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
  }

  destroy(): void {
    for (const s of this.spots) s?.char.dispose();
    this.cast.dispose();
    this.stage.dispose();
  }
}
