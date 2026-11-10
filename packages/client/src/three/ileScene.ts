/**
 * L'Île aux défis en 3D : une île en pente dont le chemin en spirale monte jusqu'au sommet,
 * les 6 défis posés sur le chemin, le volcan à part, et les personnages qui sautent de case en case.
 */
import { ILE_CELL_INFO, ILE_GATES, ILE_SUMMIT, ILE_VOLCANO, PLAYER_COLORS, ileLayout, type IleState, type PublicPlayer } from "@rzparty/shared";
import { Character3D, Die3D, Stage3D, THREE, label, sea, shade, textDisc, toon, tree, type DieLook } from "./kit3d.ts";

const LAYOUT = ileLayout();
const R = 9; // rayon de l'île (450 / 50)
const SQUASH = 315 / 450; // l'île est un peu ovale
const TOP = 4.4;
const DIE_LOOK: Record<number, DieLook> = { 6: "or", 3: "argent", 2: "bronze" };

/** Hauteur du sol à un rayon normalisé (1 = le bord du chemin). */
function heightAt(r: number): number {
  return 0.25 + TOP * Math.min(1, Math.max(0, (1 - r) / 0.78));
}
function cellPos(i: number): THREE.Vector3 {
  const p = LAYOUT[Math.min(i, LAYOUT.length - 1)]!;
  const x = (p.x - 500) / 50;
  const z = (p.y - 370) / 50;
  const r = Math.hypot(x / R, z / (R * SQUASH));
  return new THREE.Vector3(x, heightAt(r) + 0.12, z);
}
const CELLS = LAYOUT.map((_, i) => cellPos(i));
/** Le volcan, une petite île à part. */
const VOLCANO_CENTER = new THREE.Vector3(14.5, 0, -8.5);
const VOLCANO_CELLS = ILE_VOLCANO.map((_, i) => {
  const a = Math.PI * 0.9 + (i / ILE_VOLCANO.length) * Math.PI * 1.75;
  return new THREE.Vector3(VOLCANO_CENTER.x + Math.cos(a) * 2.3, 1.55, VOLCANO_CENTER.z + Math.sin(a) * 2.3);
});

export class IleScene {
  private readonly stage: Stage3D;
  private readonly cellGroup = new THREE.Group();
  private readonly gateGroup = new THREE.Group();
  private readonly chars = new Map<string, Character3D>();
  private readonly dice: Die3D[] = [new Die3D("blanc"), new Die3D("or"), new Die3D("blanc")];
  private readonly diceGroup = new THREE.Group();
  private cellsKey = "";
  private rollKey = "";
  private lava: THREE.Mesh;
  private eruption = 0;
  private focus: string | null = null;

  constructor(host: HTMLElement, private readonly wide: boolean) {
    this.stage = new Stage3D(host, { fov: 42 });
    const scene = this.stage.scene;
    const water = sea(60);
    water.mesh.position.y = -0.05;
    scene.add(water.mesh);

    // L'île : sable, puis herbe qui monte en pente douce, puis la roche du sommet.
    const profile: THREE.Vector2[] = [new THREE.Vector2(0, TOP + 0.25)];
    for (let k = 0; k <= 40; k++) {
      const r = (k / 40) * 1.05;
      profile.push(new THREE.Vector2(r * R, heightAt(r)));
    }
    profile.push(new THREE.Vector2(R * 1.12, 0.1), new THREE.Vector2(R * 1.18, -0.1));
    const land = new THREE.Mesh(new THREE.LatheGeometry(profile.reverse(), 72), toon(0x8cc63f));
    land.scale.z = SQUASH;
    scene.add(land);
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.16, R * 1.22, 0.3, 72), toon(0xf2e0b6));
    beach.scale.z = SQUASH;
    beach.position.y = -0.02;
    scene.add(beach);
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.27, 0.3, 40), toon(0xa7926c));
    rock.scale.z = SQUASH;
    rock.position.y = TOP + 0.15;
    scene.add(rock);

    // Le chemin : un ruban clair qui relie les cases.
    const curve = new THREE.CatmullRomCurve3(CELLS.map((p) => p.clone().setY(p.y - 0.2)));
    const path = new THREE.Mesh(new THREE.TubeGeometry(curve, 600, 0.2, 6, false), toon(0xe9d7a8));
    scene.add(path);

    // Des arbres un peu partout, hors du chemin.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 70; k++) {
      const a = rand() * Math.PI * 2;
      const r = 0.15 + rand() * 0.95;
      const x = Math.cos(a) * r * R;
      const z = Math.sin(a) * r * R * SQUASH;
      if (CELLS.some((c) => Math.hypot(c.x - x, c.z - z) < 0.95)) continue;
      const t = tree(0.7 + rand() * 0.6, rand() < 0.5 ? 0x3fae49 : 0x2f9a44);
      t.position.set(x, heightAt(r), z);
      scene.add(t);
    }

    // Le volcan.
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 4.4, 1.5, 40, 1, true), toon(0x6b3a2e));
    cone.position.copy(VOLCANO_CENTER).setY(0.75);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.25, 8, 40), toon(0x4a2620));
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(VOLCANO_CENTER).setY(1.5);
    this.lava = new THREE.Mesh(new THREE.CircleGeometry(2.9, 40), toon(0xff6a1f, { emissive: 0x8a2000 }));
    this.lava.rotation.x = -Math.PI / 2;
    this.lava.position.copy(VOLCANO_CENTER).setY(1.2);
    const vlabel = label("🌋 Volcan", { scale: 0.9 });
    vlabel.position.copy(VOLCANO_CENTER).setY(3.4);
    scene.add(cone, rim, this.lava, vlabel);
    VOLCANO_CELLS.forEach((p, i) => {
      const t = ILE_VOLCANO[i]!;
      const color = t === "plus4" ? 0x2f7bef : t === "cri" ? 0xf7c21b : t === "sortie" ? 0x7bcb3a : 0x8a4a3a;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.2, 20), toon(color));
      c.position.copy(p).setY(p.y - 0.08);
      scene.add(c);
      const sym = t === "plus4" ? "+4" : t === "cri" ? "!" : t === "sortie" ? "→" : "";
      if (sym) {
        const d = textDisc(sym, 0.34, { color: "#fff", outline: "#0006" });
        d.position.copy(p).setY(p.y + 0.03);
        scene.add(d);
      }
    });

    scene.add(this.cellGroup, this.gateGroup, this.diceGroup);
    this.dice.forEach((d, i) => {
      d.mesh.position.x = (i - 1) * 0.8;
      this.diceGroup.add(d.mesh);
    });
    this.diceGroup.visible = false;

    this.stage.onTick((now) => {
      water.tick(now);
      for (const c of this.chars.values()) c.tick(now);
      for (const d of this.dice) d.tick(now);
      const lavaMat = this.lava.material as THREE.MeshToonMaterial;
      lavaMat.emissive.setHex(this.eruption ? (Math.sin(now / 160) > 0 ? 0xd63a00 : 0x8a2000) : 0x8a2000);
      this.diceGroup.lookAt(this.stage.camera.position.clone().setY(this.diceGroup.position.y));
      this.frame();
    });
    this.overview(true);
  }

  private overview(instant = false): void {
    const far = this.stage.aspect < 1 ? 34 : 24;
    this.stage.look(new THREE.Vector3(2, far * 0.85, far * 0.75), new THREE.Vector3(2, 0, -0.5), instant);
  }

  /** La caméra suit le joueur dont c'est le tour (de plus loin sur l'écran commun). */
  private frame(): void {
    const c = this.focus ? this.chars.get(this.focus) : null;
    if (!c) return this.overview();
    const p = c.group.position;
    const d = this.wide ? 15 : 10;
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    if (!Number.isFinite(out.x) || out.lengthSq() < 0.1) out.set(0, 0, 1);
    if (this.stage.aspect < 1) this.stage.look(new THREE.Vector3(p.x + out.x * d * 0.3, p.y + d * 1.45, p.z + d * 0.55), p.clone().setY(p.y + 0.4));
    else this.stage.look(new THREE.Vector3(p.x + out.x * d * 0.45, p.y + d * 1.0, p.z + d * 0.7 + out.z * d * 0.2), p.clone().setY(p.y + 0.4));
  }

  private buildCells(s: IleState): void {
    const key = `${s.cells.join(",")}|${s.eruption > 0}|${s.dragonBroken}`;
    if (key === this.cellsKey) return;
    this.cellsKey = key;
    for (const g of [this.cellGroup, this.gateGroup]) {
      for (const child of [...g.children]) g.remove(child);
    }
    s.cells.forEach((type, i) => {
      const erupted = s.eruption > 0 && type !== "vide" && type !== "depart";
      const info = ILE_CELL_INFO[erupted ? "moins4" : type];
      const p = CELLS[i]!;
      const col = new THREE.Color(info.color);
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.34, 24), toon(col, erupted ? { emissive: 0x5a1a00 } : {}));
      cell.position.copy(p).setY(p.y - 0.15);
      const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 6, 24), toon(erupted ? 0xff8a1f : 0xffffff));
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.copy(p).setY(p.y + 0.01);
      this.cellGroup.add(cell, rimMesh);
      if (info.symbol) {
        const d = textDisc(info.symbol, 0.36, { color: "#fff", outline: "#0007" });
        d.position.copy(p).setY(p.y + 0.035);
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
      this.gateGroup.add(g);
    });
  }

  /** Une arche de défi : deux poteaux, une barre, et l'objet du défi. */
  private gateProp(kind: string, open: boolean): THREE.Group {
    const g = new THREE.Group();
    const wood = toon(0x9a6542);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 8), wood);
      post.position.set(side * 0.65, 0.6, 0);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.14), toon(open ? 0x2db866 : 0xb3261e));
    bar.position.y = 1.3;
    g.add(bar);
    if (kind === "liane") {
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), toon(0x2f9a44));
      vine.position.y = 0.8;
      g.add(vine);
    } else if (kind === "dragon") {
      if (open) {
        for (let k = 0; k < 5; k++) {
          const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + k * 0.02), toon(0xc0453a));
          rubble.position.set((k - 2) * 0.22, 0.1, (k % 2) * 0.2 - 0.1);
          g.add(rubble);
        }
      } else {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.9, 6), toon(0xc0453a));
        body.position.y = 0.45;
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 6), toon(0xe56b3a));
        head.position.y = 1.1;
        g.add(body, head);
      }
    } else if (kind === "caisses") {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), toon(0xc08a4a));
      crate.position.set(-0.3, 0.21, 0);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 14), toon(0x8a5a32));
      barrel.position.set(0.3, 0.23, 0);
      g.add(crate, barrel);
    } else if (kind === "volcan") {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 12), toon(0x6b3a2e));
      c.position.y = 0.3;
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(0xff6a1f, { emissive: 0xa02800 }));
      fire.position.y = 0.62;
      g.add(c, fire);
    } else if (kind === "boule") {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), toon(0x5c6370));
      ball.position.y = 0.36;
      for (let k = 0; k < 12; k++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), toon(0xd8dde4));
        const dir = new THREE.Vector3().randomDirection();
        spike.position.copy(dir.clone().multiplyScalar(0.34));
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        ball.add(spike);
      }
      g.add(ball);
    }
    return g;
  }

  /** La grande statue du sommet (défi final). */
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
    g.add(base, head, brow, nose);
    g.position.y = 0;
    return g;
  }

  private placeOf(s: IleState, id: string, index: number, count: number): THREE.Vector3 {
    const pawn = s.pawns[id]!;
    const base = pawn.volcano !== null ? VOLCANO_CELLS[pawn.volcano]! : CELLS[Math.min(pawn.cell, ILE_SUMMIT)]!;
    const spread = (index - (count - 1) / 2) * 0.42;
    // Écartés de côté, pour qu'on les voie tous.
    return base.clone().add(new THREE.Vector3(spread, 0, spread * 0.4));
  }

  update(s: IleState, players: PublicPlayer[]): void {
    this.buildCells(s);
    this.eruption = s.eruption;
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
    for (const ids of spots.values()) {
      ids.forEach((id, i) => {
        const player = players.find((x) => x.id === id);
        if (!player) return;
        const target = this.placeOf(s, id, i, ids.length);
        let c = this.chars.get(id);
        if (c && !c.same(player.avatar, player.isBot)) {
          this.stage.scene.remove(c.group);
          c.dispose();
          c = undefined;
        }
        if (!c) {
          c = new Character3D(player.avatar, { bot: player.isBot, scale: 0.55, ring: PLAYER_COLORS[player.color]?.hex ?? 0xffffff });
          c.place(target);
          this.chars.set(id, c);
          this.stage.scene.add(c.group);
          return;
        }
        const from = c.destination;
        if (from.distanceTo(target) < 0.05) return;
        const pawn = s.pawns[id]!;
        // Sur l'île, il saute case par case (sauf grands bonds : statue, OVNI…).
        const fromCell = CELLS.findIndex((p) => p.distanceTo(from) < 0.6);
        const via: THREE.Vector3[] = [];
        if (pawn.volcano === null && fromCell >= 0 && fromCell !== pawn.cell && Math.abs(pawn.cell - fromCell) <= 12) {
          const dir = pawn.cell > fromCell ? 1 : -1;
          for (let k = fromCell + dir; k !== pawn.cell; k += dir) via.push(CELLS[k]!);
        }
        c.goTo(target, via);
      });
    }
    const t = s.turn;
    this.focus = t?.playerId ?? null;
    // Les dés au-dessus du joueur.
    const roll = t?.roll;
    const actor = t ? this.chars.get(t.playerId) : undefined;
    if (roll && actor) {
      const key = `${t!.playerId}:${s.round}:${roll.std}:${roll.bonus}:${roll.extra}`;
      const values = [roll.std, roll.bonus, roll.extra];
      if (key !== this.rollKey) {
        this.rollKey = key;
        const looks: DieLook[] = ["blanc", DIE_LOOK[roll.bonusMax ?? 0] ?? "blanc", "blanc"];
        values.forEach((v, i) => {
          const d = this.dice[i]!;
          if (looks[i] !== "blanc" && i === 1) this.retint(i, looks[i]!);
          d.mesh.visible = v !== null;
          if (v !== null) d.roll(v);
        });
      }
      const shown = values.filter((v) => v !== null).length;
      this.dice.forEach((d, i) => (d.mesh.position.x = (i - (shown - 1) / 2) * 0.8));
      this.diceGroup.visible = true;
      this.diceGroup.position.copy(actor.group.position).setY(actor.group.position.y + 1.9);
    } else {
      this.diceGroup.visible = false;
    }
  }

  private retint(i: number, look: DieLook): void {
    const old = this.dice[i]!;
    if ((old as unknown as { look?: DieLook }).look === look) return;
    this.diceGroup.remove(old.mesh);
    old.dispose();
    const d = new Die3D(look);
    (d as unknown as { look?: DieLook }).look = look;
    this.dice[i] = d;
    this.diceGroup.add(d.mesh);
  }

  /** Fête quand quelqu'un vient d'atteindre le sommet ou de gagner un défi. */
  cheer(id: string): void {
    this.chars.get(id)?.cheer();
  }

  destroy(): void {
    for (const c of this.chars.values()) c.dispose();
    for (const d of this.dice) d.dispose();
    this.stage.dispose();
  }
}
