/**
 * L'Île aux défis en 3D : une île en pente dont le chemin en spirale monte jusqu'au sommet,
 * les 6 défis posés sur le chemin, le volcan à part, et les personnages qui sautent de case en case.
 * Beaucoup de petites animations : palmiers, nuages, oiseaux, fumée, éruptions, dés qui roulent,
 * poussière à chaque saut, gains et pertes de cases qui s'envolent, confettis au sommet.
 */
import { ILE_CELL_INFO, ILE_ERUPTION_BACK, ILE_GATES, ILE_SUMMIT, ILE_VOLCANO, PLAYER_COLORS, ileLayout, type IleState, type PublicPlayer } from "@rzparty/shared";
import { Character3D, Die3D, FloatTexts, Particles, Stage3D, THREE, cloud, label, palm, sea, shade, textDisc, toon, tree, type DieLook } from "./kit3d.ts";

const LAYOUT = ileLayout();
/** Échelle de la carte (1000 × 720) vers la 3D : plus grand qu'avant pour aérer les cases. */
const SCALE = 1 / 34;
const R = 450 * SCALE; // rayon de l'île
const SQUASH = 315 / 450; // l'île est un peu ovale
const TOP = 5.2;
const CELL_R = 0.42;
const DIE_LOOK: Record<number, DieLook> = { 6: "or", 3: "argent", 2: "bronze" };

/** Hauteur du sol à un rayon normalisé (1 = le bord du chemin). */
function heightAt(r: number): number {
  return 0.25 + TOP * Math.min(1, Math.max(0, (1 - r) / 0.78));
}
function rNorm(x: number, z: number): number {
  return Math.hypot(x / R, z / (R * SQUASH));
}
/** Une case est posée sur un petit pilier, au-dessus de la pente (jamais enfoncée dans la montagne). */
function cellPos(i: number): THREE.Vector3 {
  const p = LAYOUT[Math.min(i, LAYOUT.length - 1)]!;
  const x = (p.x - 500) * SCALE;
  const z = (p.y - 370) * SCALE;
  const r = rNorm(x, z);
  return new THREE.Vector3(x, heightAt(r - (CELL_R * 0.6) / R) + 0.1, z);
}
const CELLS = LAYOUT.map((_, i) => cellPos(i));
/** Le volcan, une petite île à part. */
const VOLCANO_CENTER = new THREE.Vector3(R + 6.5, 0, -R * SQUASH - 2);
const VOLCANO_CELLS = ILE_VOLCANO.map((_, i) => {
  const a = Math.PI * 0.9 + (i / ILE_VOLCANO.length) * Math.PI * 1.75;
  return new THREE.Vector3(VOLCANO_CENTER.x + Math.cos(a) * 2.6, 1.75, VOLCANO_CENTER.z + Math.sin(a) * 2.6);
});
const VOLCANO_MOUTH = VOLCANO_CENTER.clone().setY(1.9);

export class IleScene {
  private readonly stage: Stage3D;
  private readonly cellGroup = new THREE.Group();
  private readonly gateGroup = new THREE.Group();
  private readonly chars = new Map<string, Character3D>();
  private dice: Die3D[] = [];
  private diceLooks: DieLook[] = [];
  private readonly diceGroup = new THREE.Group();
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly animated: ((now: number, dt: number) => void)[] = [];
  private cellsKey = "";
  private rollId = -1;
  private lava: THREE.Mesh;
  private eruption = 0;
  private eruptionShake = 0;
  private focus: string | null = null;
  private lastCells = new Map<string, { cell: number; volcano: number | null }>();
  private lastPhase = "";
  private lastMessage = "";
  private cellMeshes: THREE.Mesh[] = [];
  private gateObjects: THREE.Group[] = [];
  private rolling: { ball: THREE.Mesh; path: THREE.Vector3[]; start: number } | null = null;
  private smokeAt = 0;
  private won = false;

  constructor(host: HTMLElement, private readonly wide: boolean) {
    this.stage = new Stage3D(host, { fov: 42 });
    this.stage.camSpeed = 0.07;
    const scene = this.stage.scene;
    const water = sea(90);
    water.mesh.position.y = -0.05;
    scene.add(water.mesh);

    // L'île : sable, puis herbe qui monte en pente douce, puis la roche du sommet.
    const profile: THREE.Vector2[] = [new THREE.Vector2(0, TOP + 0.25)];
    for (let k = 0; k <= 60; k++) {
      const r = (k / 60) * 1.05;
      profile.push(new THREE.Vector2(r * R, heightAt(r)));
    }
    profile.push(new THREE.Vector2(R * 1.12, 0.1), new THREE.Vector2(R * 1.18, -0.1));
    const land = new THREE.Mesh(new THREE.LatheGeometry(profile.reverse(), 96), toon(0x8cc63f));
    land.scale.z = SQUASH;
    scene.add(land);
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.16, R * 1.22, 0.3, 96), toon(0xf2e0b6));
    beach.scale.z = SQUASH;
    beach.position.y = -0.02;
    scene.add(beach);
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.27, 0.3, 40), toon(0xa7926c));
    rock.scale.z = SQUASH;
    rock.position.y = TOP + 0.15;
    scene.add(rock);

    // Le chemin : des dalles de sable entre les cases.
    const curve = new THREE.CatmullRomCurve3(CELLS.map((p) => p.clone().setY(p.y - 0.16)));
    const path = new THREE.Mesh(new THREE.TubeGeometry(curve, 900, 0.17, 6, false), toon(0xe9d7a8));
    scene.add(path);

    // Arbres et palmiers, loin du chemin ; les palmiers se balancent au vent.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 140; k++) {
      const a = rand() * Math.PI * 2;
      const r = 0.12 + rand() * 0.98;
      const x = Math.cos(a) * r * R;
      const z = Math.sin(a) * r * R * SQUASH;
      if (CELLS.some((c) => Math.hypot(c.x - x, c.z - z) < 1.25)) continue;
      const isPalm = r > 0.8 || rand() < 0.3;
      const t = isPalm ? palm(0.6 + rand() * 0.35) : tree(0.7 + rand() * 0.6, rand() < 0.5 ? 0x3fae49 : 0x2f9a44);
      t.position.set(x, heightAt(r) - 0.05, z);
      t.rotation.y = rand() * Math.PI * 2;
      scene.add(t);
      const phase = rand() * 10;
      const crown = t.userData.crown as THREE.Object3D | undefined;
      this.animated.push((now) => {
        if (crown) crown.rotation.z = Math.sin(now / 900 + phase) * 0.12;
        else t.rotation.z = Math.sin(now / 1300 + phase) * 0.025;
      });
    }

    // Nuages qui passent, oiseaux qui tournent.
    for (let k = 0; k < 7; k++) {
      const c = cloud(1 + rand() * 1.2);
      const y = 9 + rand() * 4;
      const z = -18 + rand() * 30;
      const speed = 0.4 + rand() * 0.5;
      const off = rand() * 60;
      scene.add(c);
      this.animated.push((now) => c.position.set((((now / 1000) * speed + off) % 60) - 30, y, z));
    }
    for (let k = 0; k < 5; k++) {
      const bird = new THREE.Group();
      const wingMat = toon(0xffffff);
      const wings = [-1, 1].map((side) => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.16), wingMat);
        w.position.x = side * 0.25;
        const pivot = new THREE.Group();
        pivot.add(w);
        bird.add(pivot);
        return { pivot, side };
      });
      const radius = 6 + rand() * 6;
      const h = 7 + rand() * 3;
      const sp = 0.2 + rand() * 0.2;
      const off = rand() * 10;
      scene.add(bird);
      this.animated.push((now) => {
        const a = (now / 1000) * sp + off;
        bird.position.set(Math.cos(a) * radius, h + Math.sin(a * 3) * 0.3, Math.sin(a) * radius * SQUASH);
        bird.rotation.y = -a;
        for (const w of wings) w.pivot.rotation.z = w.side * Math.sin(now / 120 + off) * 0.6;
      });
    }

    // Le volcan, qui fume en permanence.
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.8, 1.8, 40, 1, true), toon(0x6b3a2e));
    cone.position.copy(VOLCANO_CENTER).setY(0.9);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 8, 40), toon(0x4a2620));
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(VOLCANO_CENTER).setY(1.8);
    this.lava = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), toon(0xff6a1f, { emissive: 0x8a2000 }));
    this.lava.rotation.x = -Math.PI / 2;
    this.lava.position.copy(VOLCANO_CENTER).setY(1.4);
    const vlabel = label("🌋 Volcan", { scale: 0.9 });
    vlabel.position.copy(VOLCANO_CENTER).setY(4.2);
    scene.add(cone, rim, this.lava, vlabel);
    VOLCANO_CELLS.forEach((p, i) => {
      const t = ILE_VOLCANO[i]!;
      const color = t === "plus4" ? 0x2f7bef : t === "cri" ? 0xf7c21b : t === "sortie" ? 0x7bcb3a : 0x8a4a3a;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.24, 20), toon(color));
      c.position.copy(p).setY(p.y - 0.1);
      scene.add(c);
      const sym = t === "plus4" ? "+4" : t === "cri" ? "!" : t === "sortie" ? "→" : "";
      if (sym) {
        const d = textDisc(sym, 0.34, { color: "#fff", outline: "#0006" });
        d.position.copy(p).setY(p.y + 0.03);
        scene.add(d);
      }
    });

    scene.add(this.cellGroup, this.gateGroup, this.diceGroup, this.fx.group, this.texts.group);
    this.diceGroup.visible = false;

    this.stage.onTick((now, dt) => {
      water.tick(now);
      for (const fn of this.animated) fn(now, dt);
      for (const c of this.chars.values()) c.tick(now);
      for (const d of this.dice) d.tick(now);
      this.fx.tick(now, dt);
      this.texts.tick(now);
      this.tickVolcano(now);
      this.tickGates(now);
      this.tickRollingBall(now);
      this.diceGroup.lookAt(this.stage.camera.position.clone().setY(this.diceGroup.position.y));
      this.frame(now);
    });
    this.overview(true);
  }

  private tickVolcano(now: number): void {
    const lavaMat = this.lava.material as THREE.MeshToonMaterial;
    lavaMat.emissive.setHex(this.eruption ? (Math.sin(now / 160) > 0 ? 0xd63a00 : 0x8a2000) : Math.sin(now / 700) > 0.6 ? 0xa02a00 : 0x8a2000);
    // Fumée (et lave pendant l'éruption).
    if (now - this.smokeAt > (this.eruption ? 90 : 420)) {
      this.smokeAt = now;
      this.fx.burst(VOLCANO_MOUTH, { count: 1, colors: [0x9a9a9a, 0xbdbdbd], speed: 0.6, up: 2.2, gravity: -0.4, life: 2600, size: 0.9, spread: 0.3 });
      if (this.eruption) this.fx.burst(VOLCANO_MOUTH, { count: 2, colors: [0xff6a1f, 0xffc83d, 0xd63a00], speed: 3, up: 2.5, gravity: 6, life: 1300, size: 0.35 });
    }
    // Les cases spéciales rougeoient pendant l'éruption.
    for (const m of this.cellMeshes) {
      if (!m.userData.erupted) continue;
      (m.material as THREE.MeshToonMaterial).emissive.setHex(Math.sin(now / 200) > 0 ? 0x7a2200 : 0x3a1000);
    }
  }

  private tickGates(now: number): void {
    for (const g of this.gateObjects) {
      const anim = g.userData.anim as ((now: number) => void) | undefined;
      anim?.(now);
    }
  }

  private tickRollingBall(now: number): void {
    const r = this.rolling;
    if (!r) return;
    const t = (now - r.start) / 1800;
    if (t >= 1) {
      this.stage.scene.remove(r.ball);
      this.fx.burst(r.path.at(-1)!, { count: 16, colors: [0x8f8a80, 0xd8dde4], speed: 2.5, life: 700 });
      this.rolling = null;
      return;
    }
    const f = t * (r.path.length - 1);
    const k = Math.floor(f);
    const a = r.path[k]!;
    const b = r.path[Math.min(k + 1, r.path.length - 1)]!;
    r.ball.position.lerpVectors(a, b, f - k).setY(a.y + (b.y - a.y) * (f - k) + 0.45);
    r.ball.rotation.x += 0.3;
  }

  private overview(instant = false): void {
    const far = this.stage.aspect < 1 ? 46 : 30;
    this.stage.look(new THREE.Vector3(3, far * 0.85, far * 0.75), new THREE.Vector3(3, 0, -0.5), instant);
  }

  /** La caméra suit de près le joueur dont c'est le tour (et tremble pendant une éruption). */
  private frame(now: number): void {
    const c = this.focus ? this.chars.get(this.focus) : null;
    if (!c || this.won) {
      if (this.won && c) {
        const p = c.group.position;
        const a = now / 3000;
        this.stage.look(new THREE.Vector3(p.x + Math.cos(a) * 6, p.y + 4, p.z + Math.sin(a) * 6), p.clone().setY(p.y + 1));
        return;
      }
      return this.overview();
    }
    const p = c.group.position;
    const d = this.wide ? 8.5 : 6.5;
    const out = new THREE.Vector3(p.x, 0, p.z);
    if (out.lengthSq() < 0.5) out.set(0, 0, 1);
    out.normalize();
    const shake = this.eruptionShake > now ? Math.sin(now / 25) * 0.15 : 0;
    const look = p.clone().setY(p.y + 0.5 + shake);
    if (this.stage.aspect < 1) this.stage.look(new THREE.Vector3(p.x + out.x * d * 0.45, p.y + d * 1.25, p.z + out.z * d * 0.45 + d * 0.45), look);
    else this.stage.look(new THREE.Vector3(p.x + out.x * d * 0.7, p.y + d * 0.85, p.z + out.z * d * 0.7 + d * 0.35), look);
  }

  private buildCells(s: IleState): void {
    const key = `${s.cells.join(",")}|${s.eruption}|${s.dragonBroken}`;
    if (key === this.cellsKey) return;
    this.cellsKey = key;
    for (const g of [this.cellGroup, this.gateGroup]) {
      for (const child of [...g.children]) g.remove(child);
    }
    this.cellMeshes = [];
    this.gateObjects = [];
    const stone = toon(0xd9c79a);
    s.cells.forEach((type, i) => {
      const erupted = s.eruption > 0 && type !== "vide" && type !== "depart";
      const info = ILE_CELL_INFO[erupted ? "moins4" : type];
      const p = CELLS[i]!;
      // Pilier de pierre jusqu'au sol, puis le dessus coloré.
      const ground = heightAt(rNorm(p.x, p.z)) - 0.3;
      const pillarH = Math.max(0.2, p.y - 0.1 - ground);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(CELL_R * 0.92, CELL_R * 1.05, pillarH, 20), stone);
      pillar.position.copy(p).setY(ground + pillarH / 2);
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(CELL_R, CELL_R, 0.16, 24), toon(info.color, erupted ? { emissive: 0x5a1a00 } : {}));
      cell.position.copy(p).setY(p.y - 0.08);
      cell.userData.erupted = erupted;
      const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(CELL_R, 0.035, 6, 24), toon(erupted ? 0xff8a1f : 0xffffff));
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.copy(p).setY(p.y + 0.005);
      this.cellGroup.add(pillar, cell, rimMesh);
      this.cellMeshes[i] = cell;
      const symbol = erupted ? `−${ILE_ERUPTION_BACK * s.eruption}` : info.symbol;
      if (symbol) {
        const d = textDisc(symbol, CELL_R * 0.86, { color: "#fff", outline: "#0007" });
        d.position.copy(p).setY(p.y + 0.02);
        this.cellGroup.add(d);
      }
    });
    ILE_GATES.forEach((gate, i) => {
      const a = CELLS[gate.after]!;
      const b = CELLS[Math.min(gate.after + 1, ILE_SUMMIT)]!;
      const mid = a.clone().lerp(b, 0.5);
      const g = gate.kind === "final" ? this.finalStatue() : this.gateProp(gate.kind, gate.kind === "dragon" && s.dragonBroken);
      g.position.copy(gate.kind === "final" ? b : mid);
      if (gate.kind !== "final") g.lookAt(b.x, g.position.y, b.z);
      const tag = label(`${i + 1}. ${gate.label}`, { scale: 0.42, width: 512, height: 96 });
      tag.position.set(0, gate.kind === "final" ? 3.3 : 2.1, 0);
      g.add(tag);
      g.userData.kind = gate.kind;
      this.gateGroup.add(g);
      this.gateObjects[i] = g;
    });
  }

  /** Une arche de défi : deux poteaux, une barre, et l'objet du défi (animé). */
  private gateProp(kind: string, open: boolean): THREE.Group {
    const g = new THREE.Group();
    const wood = toon(0x9a6542);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), wood);
      post.position.set(side * 0.7, 0.7, 0);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.14), toon(open ? 0x2db866 : 0xb3261e));
    bar.position.y = 1.5;
    g.add(bar);
    if (kind === "liane") {
      // La liane se balance.
      const pivot = new THREE.Group();
      pivot.position.y = 1.45;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), toon(0x2f9a44));
      vine.position.y = -0.55;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(0x2f9a44));
      knot.position.y = -1.1;
      pivot.add(vine, knot);
      g.add(pivot);
      g.userData.anim = (now: number) => (pivot.rotation.x = Math.sin(now / 500) * 0.5);
    } else if (kind === "dragon") {
      if (open) {
        for (let k = 0; k < 5; k++) {
          const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + k * 0.02), toon(0xc0453a));
          rubble.position.set((k - 2) * 0.22, 0.1, (k % 2) * 0.2 - 0.1);
          g.add(rubble);
        }
      } else {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1, 6), toon(0xc0453a));
        body.position.y = 0.5;
        const head = new THREE.Group();
        head.position.y = 1.15;
        const skull = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 6), toon(0xe56b3a));
        skull.rotation.x = Math.PI / 2;
        const eyeMat = toon(0xffe58a, { emissive: 0xa06000 });
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat);
          eye.position.set(side * 0.13, 0.1, 0.08);
          head.add(eye);
        }
        head.add(skull);
        g.add(body, head);
        g.userData.anim = (now: number) => {
          head.rotation.y = Math.sin(now / 900) * 0.4;
          head.position.y = 1.15 + Math.sin(now / 400) * 0.03;
        };
      }
    } else if (kind === "caisses") {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), toon(0xc08a4a));
      crate.position.set(-0.3, 0.21, 0);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 14), toon(0x8a5a32));
      barrel.position.set(0.3, 0.23, 0);
      // Un filet d'eau (la cascade) qui scintille.
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), toon(0x7fd3ff, { transparent: true, opacity: 0.55 }));
      fall.position.set(0, 0.6, -0.35);
      g.add(crate, barrel, fall);
      g.userData.anim = (now: number) => {
        crate.position.y = 0.21 + Math.sin(now / 350) * 0.03;
        barrel.rotation.y = now / 800;
        (fall.material as THREE.MeshToonMaterial).opacity = 0.45 + Math.sin(now / 150) * 0.1;
      };
    } else if (kind === "volcan") {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 12), toon(0x6b3a2e));
      c.position.y = 0.3;
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(0xff6a1f, { emissive: 0xa02800 }));
      fire.position.y = 0.62;
      g.add(c, fire);
      g.userData.anim = (now: number) => fire.scale.setScalar(1 + Math.sin(now / 120) * 0.25);
    } else if (kind === "boule") {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), toon(0x5c6370));
      ball.position.y = 0.4;
      for (let k = 0; k < 12; k++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), toon(0xd8dde4));
        const dir = new THREE.Vector3().randomDirection();
        spike.position.copy(dir.clone().multiplyScalar(0.34));
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        ball.add(spike);
      }
      g.add(ball);
      g.userData.anim = (now: number) => {
        ball.rotation.y = now / 600;
        ball.position.y = 0.4 + Math.abs(Math.sin(now / 500)) * 0.08;
      };
      g.userData.ball = ball;
    }
    return g;
  }

  /** La grande statue du sommet (défi final), aux yeux qui brillent. */
  private finalStatue(): THREE.Group {
    const g = new THREE.Group();
    const stone = toon(0x8f8a80);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 20), toon(0xffc83d));
    base.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.8), stone);
    head.position.y = 1.3;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.9), toon(shade(0x8f8a80, -0.2)));
    brow.position.y = 1.65;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.3), stone);
    nose.position.set(0, 1.25, 0.5);
    const eyeMat = toon(0xffe58a, { emissive: 0x7a5200 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), eyeMat);
      eye.position.set(side * 0.25, 1.5, 0.41);
      g.add(eye);
    }
    g.add(base, head, brow, nose);
    g.userData.anim = (now: number) => eyeMat.emissive.setHex(Math.sin(now / 300) > 0 ? 0xc08a00 : 0x7a5200);
    return g;
  }

  private placeOf(s: IleState, id: string, index: number, count: number): THREE.Vector3 {
    const pawn = s.pawns[id]!;
    const base = pawn.volcano !== null ? VOLCANO_CELLS[pawn.volcano]! : CELLS[Math.min(pawn.cell, ILE_SUMMIT)]!;
    const spread = (index - (count - 1) / 2) * 0.36;
    return base.clone().add(new THREE.Vector3(spread, 0, spread * 0.4));
  }

  update(s: IleState, players: PublicPlayer[]): void {
    const now = performance.now();
    if (s.eruption > this.eruption) {
      // Nouvelle éruption : grosse gerbe de lave et la caméra qui tremble.
      this.fx.burst(VOLCANO_MOUTH, { count: 40, colors: [0xff6a1f, 0xffc83d, 0xd63a00], speed: 4, up: 2.5, gravity: 6, life: 1600, size: 0.45 });
      this.eruptionShake = now + 900;
    }
    this.eruption = s.eruption;
    this.buildCells(s);
    const spots = new Map<string, string[]>();
    for (const id of s.order) {
      const p = s.pawns[id];
      if (!p) continue;
      const key = p.volcano !== null ? `v${p.volcano}` : `c${p.cell}`;
      spots.set(key, [...(spots.get(key) ?? []), id]);
    }
    for (const [id, c] of this.chars) {
      if (!s.pawns[id]) {
        this.stage.scene.remove(c.group);
        c.dispose();
        this.chars.delete(id);
      }
    }
    const t = s.turn;
    for (const ids of spots.values()) {
      ids.forEach((id, i) => {
        const player = players.find((x) => x.id === id);
        if (!player) return;
        const pawn = s.pawns[id]!;
        const target = this.placeOf(s, id, i, ids.length);
        let c = this.chars.get(id);
        if (c && !c.same(player.avatar, player.isBot)) {
          this.stage.scene.remove(c.group);
          c.dispose();
          c = undefined;
        }
        if (!c) {
          c = new Character3D(player.avatar, { bot: player.isBot, scale: 0.7, ring: PLAYER_COLORS[player.color]?.hex ?? 0xffffff });
          c.place(target);
          c.onLand = (at) => this.fx.burst(at.clone().setY(at.y + 0.05), { count: 6, colors: [0xf2e0b6, 0xffffff], speed: 0.9, up: 0.6, gravity: 2, life: 500, size: 0.16 });
          this.chars.set(id, c);
          this.stage.scene.add(c.group);
          this.lastCells.set(id, { cell: pawn.cell, volcano: pawn.volcano });
          return;
        }
        // Gains et pertes de cases hors déplacement normal : un « +N » ou « −N » s'envole.
        const before = this.lastCells.get(id);
        if (before) {
          const moving = t?.playerId === id && t.phase === "move";
          if (pawn.volcano !== null && before.volcano === null) {
            this.texts.add("🌋 Au volcan !", c.group.position.clone().setY(c.group.position.y + 1.4), "#ffb199");
            this.fx.burst(c.group.position, { count: 18, colors: [0xff6a1f, 0xffc83d], speed: 2.5, life: 900 });
          } else if (pawn.volcano === null && before.volcano !== null) {
            this.texts.add("Sorti !", c.group.position.clone().setY(c.group.position.y + 1.4), "#bff5c8");
          } else if (!moving && pawn.volcano === null && pawn.cell !== before.cell) {
            const delta = pawn.cell - before.cell;
            this.texts.add(delta > 0 ? `+${delta}` : `−${-delta}`, c.group.position.clone().setY(c.group.position.y + 1.4), delta > 0 ? "#8ff0a4" : "#ff9a8a", 0.9);
            if (delta > 0) this.fx.burst(c.group.position.clone().setY(c.group.position.y + 0.6), { count: 14, colors: [0x8ff0a4, 0xffffff, 0xffe58a], speed: 2, life: 800 });
          }
        }
        this.lastCells.set(id, { cell: pawn.cell, volcano: pawn.volcano });
        const from = c.destination;
        if (from.distanceTo(target) < 0.05) return;
        // Sur l'île, il saute case par case (sauf grands bonds : statue, OVNI…).
        const fromCell = CELLS.findIndex((p) => Math.hypot(p.x - from.x, p.z - from.z) < 0.5);
        const via: THREE.Vector3[] = [];
        if (pawn.volcano === null && fromCell >= 0 && fromCell !== pawn.cell && Math.abs(pawn.cell - fromCell) <= 12) {
          const dir = pawn.cell > fromCell ? 1 : -1;
          for (let k = fromCell + dir; k !== pawn.cell; k += dir) via.push(CELLS[k]!);
        }
        c.goTo(target, via);
      });
    }
    this.focus = t?.playerId ?? null;
    this.updateChallengeFx(s);
    this.updateDice(s);
  }

  /** Réussites et échecs des défis : étincelles, feu du dragon, boule qui dévale, victoire. */
  private updateChallengeFx(s: IleState): void {
    const t = s.turn;
    const key = `${t?.phase}|${t?.message}`;
    if (!t || key === `${this.lastPhase}|${this.lastMessage}`) return;
    this.lastPhase = t.phase;
    this.lastMessage = t.message;
    const actor = this.chars.get(t.playerId);
    const ch = t.challenge;
    if (!actor || !ch || ch.ok === null || t.phase !== "challenge") return;
    const gate = this.gateObjects[ch.gate];
    const kind = ILE_GATES[ch.gate]!.kind;
    const at = gate ? gate.position.clone().setY(gate.position.y + 0.8) : actor.group.position.clone();
    if (ch.ok) {
      actor.cheer(1500);
      this.fx.burst(at, { count: 26, colors: [0xffe58a, 0xffffff, 0x8ff0a4], speed: 3, life: 1000, size: 0.2 });
      if (kind === "final") {
        this.won = true;
        for (let k = 0; k < 4; k++) {
          setTimeout(() => this.fx.burst(at.clone().setY(at.y + 1.5), { count: 40, colors: [0xf0483e, 0x2f7bef, 0xffc83d, 0x2db866, 0x9257e8], speed: 4, up: 1.8, gravity: 3, life: 2200, size: 0.22 }), k * 350);
        }
      }
      return;
    }
    if (kind === "dragon") this.fx.burst(at.clone().setY(at.y + 0.4), { count: 30, colors: [0xff6a1f, 0xffc83d, 0xd63a00], speed: 3, up: 0.5, gravity: 1, life: 900, size: 0.3 });
    else if (kind === "volcan") this.fx.burst(at, { count: 24, colors: [0xff6a1f, 0xffc83d], speed: 3, life: 900 });
    else if (kind === "boule") {
      // La boule dévale le chemin jusqu'au 4e défi.
      const from = ILE_GATES[ch.gate]!.after;
      const to = ILE_GATES.find((g) => g.kind === "volcan")!.after + 1;
      const path: THREE.Vector3[] = [];
      for (let k = from; k >= to; k--) path.push(CELLS[k]!);
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), toon(0x5c6370));
      this.stage.scene.add(ball);
      this.rolling = { ball, path, start: performance.now() };
    } else if (kind === "final") this.fx.burst(at, { count: 12, colors: [0x8f8a80], speed: 1.5, life: 700 });
  }

  /** Dés au-dessus du joueur : dé normal + dé bonus (+ dé en plus), ou un seul dé pour un défi. */
  private updateDice(s: IleState): void {
    const t = s.turn;
    const actor = t ? this.chars.get(t.playerId) : undefined;
    const roll = t?.roll;
    const gateValue = t && (t.phase === "challenge" || t.phase === "gate") && t.challenge?.value !== null && t.challenge?.value !== undefined && !roll ? t.challenge.value : null;
    if (!t || !actor || (!roll && gateValue === null)) {
      this.diceGroup.visible = false;
      return;
    }
    const values = roll ? [roll.std, roll.bonus, roll.extra].filter((v): v is number => v !== null) : [gateValue!];
    const looks: DieLook[] = roll ? ["blanc", ...(roll.bonus !== null ? [DIE_LOOK[roll.bonusMax ?? 0] ?? "blanc"] : []), ...(roll.extra !== null ? ["blanc" as DieLook] : [])] : ["blanc"];
    if (t.rollId !== this.rollId) {
      this.rollId = t.rollId;
      this.setDice(looks);
      this.dice.forEach((d, i) => d.roll(values[i]!));
    }
    this.diceGroup.visible = true;
    this.diceGroup.position.copy(actor.group.position).setY(actor.group.position.y + 1.9);
  }

  /** Recrée les dés si leur nombre ou leur couleur change (or, argent, bronze). */
  private setDice(looks: DieLook[]): void {
    if (looks.join() === this.diceLooks.join()) return;
    for (const d of this.dice) {
      this.diceGroup.remove(d.mesh);
      d.dispose();
    }
    this.diceLooks = looks;
    this.dice = looks.map((look, i) => {
      const d = new Die3D(look, 0.55);
      // La valeur se tourne vers la caméra (et pas vers le ciel).
      d.viewer = this.stage.camera;
      d.mesh.position.x = (i - (looks.length - 1) / 2) * 0.75;
      this.diceGroup.add(d.mesh);
      return d;
    });
  }

  destroy(): void {
    for (const c of this.chars.values()) c.dispose();
    for (const d of this.dice) d.dispose();
    this.stage.dispose();
  }
}
