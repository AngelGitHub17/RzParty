/**
 * Le Tour du monde en 3D : un vrai globe qui tourne vers le joueur dont c'est le tour,
 * les chemins qui en font le tour, les destinations avec leur drapeau, et les voyageurs qui sautent de case en case.
 */
import { DESTINATIONS, PLAYER_COLORS, type GlobeState, type PublicPlayer, type SpaceKind } from "@rzparty/shared";
import { Character3D, Stage3D, THREE, label, textDisc, toon } from "./kit3d.ts";

const R = 5;
const LAT_MARGIN = 0.12;
const STEP_MS = 320;
const UP = new THREE.Vector3(0, 1, 0);

/** Direction (vecteur unité) d'un point de la carte 1000 × 560, sur le globe (même projection que la texture). */
function dirOf(x: number, y: number): THREE.Vector3 {
  const phi = (x / 1000) * Math.PI * 2;
  const theta = Math.PI * (LAT_MARGIN + (y / 560) * (1 - 2 * LAT_MARGIN));
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
}

export interface GlobeArt {
  continents: string[];
  icons: Record<SpaceKind, string>;
}

interface Traveller {
  anchor: THREE.Group;
  char: Character3D;
  space: number;
  path: number[];
  start: number;
  offset: number;
}

export class GlobeScene {
  private readonly stage: Stage3D;
  private readonly globe = new THREE.Group();
  private readonly options = new THREE.Group();
  private readonly hot = new THREE.Group();
  private readonly people = new Map<string, Traveller>();
  private dirs: THREE.Vector3[] = [];
  private built = false;
  private focus: string | null = null;
  private hotKey = "";
  private optKey = "";
  private shownMove = -1;
  private camDir = new THREE.Vector3(0, 0.3, 1).normalize();

  constructor(host: HTMLElement, private readonly wide: boolean, private readonly art: GlobeArt, private readonly onMove: (space: number) => void) {
    this.stage = new Stage3D(host, { fov: 38 });
    this.stage.camSpeed = 0.05;
    this.stage.scene.add(this.globe);
    // Étoiles.
    const stars = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let k = 0; k < 500; k++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 30);
      pts.push(v.x, v.y, v.z);
    }
    stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.stage.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 })));
    this.globe.add(this.options, this.hot);
    this.stage.onTick((now) => this.tick(now));
  }

  private build(g: GlobeState): void {
    this.built = true;
    // La texture du globe : océan, banquise aux pôles, continents.
    const W = 2048;
    const H = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#e9f6ff");
    grad.addColorStop(LAT_MARGIN * 0.8, "#e9f6ff");
    grad.addColorStop(LAT_MARGIN * 1.1, "#4fb3ec");
    grad.addColorStop(0.5, "#5eb8f2");
    grad.addColorStop(1 - LAT_MARGIN * 1.1, "#4fb3ec");
    grad.addColorStop(1 - LAT_MARGIN * 0.8, "#e9f6ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const top = LAT_MARGIN * H;
    const sy = (H * (1 - 2 * LAT_MARGIN)) / 560;
    const sx = W / 1000;
    ctx.lineJoin = "round";
    for (const poly of this.art.continents) {
      const pts = poly.split(" ").map((p) => p.split(",").map(Number) as [number, number]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * sx, top + y * sy) : ctx.moveTo(x * sx, top + y * sy)));
      ctx.closePath();
      ctx.fillStyle = "#9be07a";
      ctx.strokeStyle = "#6cbf55";
      ctx.lineWidth = 8;
      ctx.fill();
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshToonMaterial({ map: tex }));
    this.globe.add(ball);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.18, side: THREE.BackSide }));
    this.globe.add(halo);

    this.dirs = g.map.map((s) => dirOf(s.x, s.y));
    // Les chemins : des arcs blancs posés sur le globe.
    const roadMat = toon(0xffffff);
    for (const s of g.map) {
      for (const n of s.next) {
        if (n < s.id) continue;
        const a = this.dirs[s.id]!;
        const b = this.dirs[n]!;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 10; k++) pts.push(a.clone().lerp(b, k / 10).normalize().multiplyScalar(R + 0.02));
        this.globe.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 5, false), roadMat));
      }
    }
    // Les cases.
    for (const s of g.map) {
      const dest = s.destination !== undefined;
      const pad = new THREE.Group();
      pad.position.copy(this.dirs[s.id]!).multiplyScalar(R);
      pad.quaternion.setFromUnitVectors(UP, this.dirs[s.id]!);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(dest ? 0.26 : 0.19, dest ? 0.28 : 0.21, 0.1, 20), toon(dest ? 0xffffff : 0x1e2a4a));
      disc.position.y = 0.04;
      const sym = textDisc(dest ? DESTINATIONS[s.destination!]!.flag : this.art.icons[s.kind], dest ? 0.22 : 0.16, {});
      sym.position.y = 0.1;
      pad.add(disc, sym);
      this.globe.add(pad);
    }
  }

  /** Orientation d'un point posé sur le globe, debout. */
  private standAt(dir: THREE.Vector3): THREE.Quaternion {
    return new THREE.Quaternion().setFromUnitVectors(UP, dir);
  }

  update(g: GlobeState, players: PublicPlayer[], mine: boolean): void {
    if (!this.built) this.build(g);
    const turn = g.turn;
    this.focus = turn?.playerId ?? null;
    // Les voyageurs.
    for (const [id, t] of this.people) {
      if (g.positions[id] === undefined) {
        this.globe.remove(t.anchor);
        t.char.dispose();
        this.people.delete(id);
      }
    }
    const newMove = turn && turn.moveId !== this.shownMove;
    if (turn) this.shownMove = turn.moveId;
    const byCell = new Map<number, string[]>();
    for (const id of g.order) byCell.set(g.positions[id]!, [...(byCell.get(g.positions[id]!) ?? []), id]);
    for (const id of g.order) {
      const p = players.find((x) => x.id === id);
      const space = g.positions[id];
      if (!p || space === undefined) continue;
      const mates = byCell.get(space)!;
      const offset = (mates.indexOf(id) - (mates.length - 1) / 2) * 0.32;
      let t = this.people.get(id);
      if (t && !t.char.same(p.avatar, p.isBot)) {
        this.globe.remove(t.anchor);
        t.char.dispose();
        t = undefined;
      }
      if (!t) {
        const anchor = new THREE.Group();
        const char = new Character3D(p.avatar, { bot: p.isBot, scale: 0.36, ring: PLAYER_COLORS[p.color]?.hex ?? 0xffffff });
        anchor.add(char.group);
        anchor.quaternion.copy(this.standAt(this.dirs[space]!));
        this.globe.add(anchor);
        t = { anchor, char, space, path: [], start: 0, offset };
        this.people.set(id, t);
      }
      t.offset = offset;
      if (space !== t.space) {
        const path = newMove && turn!.playerId === id && turn!.path.length ? turn!.path : [t.space, space];
        t.path = path[0] === t.space ? path : [t.space, ...path];
        t.start = performance.now();
        t.space = space;
      }
    }
    this.renderHot(g);
    this.renderOptions(g, mine);
  }

  private renderHot(g: GlobeState): void {
    const key = g.hotspots.map((h) => h.space).join(",");
    if (key === this.hotKey) return;
    this.hotKey = key;
    for (const c of [...this.hot.children]) this.hot.remove(c);
    for (const hs of g.hotspots) {
      const dir = this.dirs[hs.space]!;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 32), toon(0xffc83d, { emissive: 0x7a5200 }));
      ring.position.copy(dir).multiplyScalar(R + 0.06);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const cam = label("📷", { scale: 0.55, width: 128, height: 128, outline: undefined });
      cam.position.copy(dir).multiplyScalar(R + 1.1);
      this.hot.add(ring, cam);
    }
  }

  private renderOptions(g: GlobeState, mine: boolean): void {
    const choice = g.turn?.choice;
    const opts = choice?.type === "move" ? choice.options : [];
    const key = `${opts.join(",")}|${mine}`;
    if (key === this.optKey) return;
    this.optKey = key;
    this.stage.clearPicks();
    for (const c of [...this.options.children]) this.options.remove(c);
    for (const space of opts) {
      const dir = this.dirs[space]!;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 24), toon(0xffc83d, { transparent: true, opacity: 0.75 }));
      ring.position.copy(dir).multiplyScalar(R + 0.08);
      ring.quaternion.setFromUnitVectors(UP, dir);
      this.options.add(ring);
      if (mine) this.stage.pick(ring, () => this.onMove(space));
    }
  }

  private tick(now: number): void {
    for (const t of this.people.values()) {
      let dir: THREE.Vector3;
      let hop = 0;
      if (t.path.length > 1) {
        const f = (now - t.start) / STEP_MS;
        const k = Math.floor(f);
        if (k >= t.path.length - 1) {
          t.path = [];
          dir = this.dirs[t.space]!;
        } else {
          const a = this.dirs[t.path[k]!]!;
          const b = this.dirs[t.path[k + 1]!]!;
          const u = f - k;
          dir = a.clone().lerp(b, u).normalize();
          hop = Math.sin(u * Math.PI) * 0.35;
        }
      } else dir = this.dirs[t.space]!;
      t.anchor.quaternion.copy(this.standAt(dir));
      t.char.group.position.set(t.offset, R + 0.08 + hop, 0);
      t.char.tick(now);
    }
    for (const c of this.options.children) c.scale.setScalar(1 + Math.sin(now / 200) * 0.08);
    // La caméra tourne autour du globe pour garder le joueur en vue.
    const f = this.focus ? this.people.get(this.focus) : null;
    if (f) {
      const target = new THREE.Vector3(0, R, 0).applyQuaternion(f.anchor.quaternion).normalize();
      this.camDir.lerp(target, 0.04).normalize();
    } else {
      this.camDir.applyAxisAngle(UP, 0.002);
    }
    const portrait = this.stage.aspect < 1;
    const dist = portrait ? 17 : this.wide ? 11.5 : 13;
    const tilt = this.camDir.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    this.stage.look(tilt.clone().multiplyScalar(dist), this.camDir.clone().multiplyScalar(R * 0.55), true);
  }

  destroy(): void {
    for (const t of this.people.values()) t.char.dispose();
    this.stage.dispose();
  }
}
