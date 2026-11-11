/**
 * Tour de cadeaux en 3D : chaque joueur empile des paquets enrubannés sur son socle ; le cadeau
 * suivant se balance au bout d'une corde, et la caméra monte avec la tour. Une tour ratée s'écroule.
 */
import { giftCenter, type Tower } from "./types.ts";
import { FloatTexts, Particles, Stage3D, THREE, label, toon } from "../three/kit3d.ts";

const W = 20; // 20 unités du dessin 2D (100 de large) = 1 unité 3D
const GAP = 7;
const RIBBONS = [0xf0483e, 0x3f7fe0, 0x2db866, 0x9b59d0, 0xff8a1f, 0x18bdbd];

interface Col {
  group: THREE.Group;
  blocks: THREE.Group[];
  key: string;
  swing: THREE.Group;
  rope: THREE.Mesh;
  fell: boolean;
  fallAt: number;
}

function giftBox(width: number, color: number, base = false): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, 0.92, 1.4), toon(base ? 0x56627f : color));
  g.add(box);
  if (!base) {
    const ribbonMat = toon(0xffffff);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.94, 1.42), ribbonMat);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.94, 0.16), ribbonMat);
    g.add(r1, r2);
  }
  return g;
}

export class CadeauxScene {
  private readonly stage: Stage3D;
  private readonly cols = new Map<string, Col>();
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private camY = 2;

  constructor(host: HTMLElement, private readonly ids: string[], names: Map<string, { name: string; color: string }>) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ids.length * GAP + 8, 0.4, 8), toon(0xfff1d6));
    floor.position.y = -0.2;
    scene.add(floor, this.fx.group, this.texts.group);
    ids.forEach((id, i) => {
      const group = new THREE.Group();
      group.position.x = (i - (ids.length - 1) / 2) * GAP;
      const info = names.get(id);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.3, 32), toon(info?.color ?? 0xffffff));
      pedestal.position.y = 0.15;
      group.add(pedestal);
      if (ids.length > 1 && info) {
        const tag = label(info.name, { scale: 0.45, width: 384, height: 96 });
        tag.position.set(0, -0.2, 3.4);
        group.add(tag);
      }
      const swing = new THREE.Group();
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), toon(0x56627f));
      scene.add(rope);
      group.add(swing);
      scene.add(group);
      this.cols.set(id, { group, blocks: [], key: "", swing, rope, fell: false, fallAt: 0 });
    });
    this.stage.onTick((now, dt) => this.tick(now, dt));
  }

  /** Appelé à chaque image : une tour et l'instant du balancement de son cadeau (ou null). */
  draw(id: string, tower: Tower, swingT: number | null): void {
    const col = this.cols.get(id);
    if (!col) return;
    const key = tower.blocks.map((b) => b.join(":")).join("|");
    if (key !== col.key) {
      const added = tower.blocks.length > col.blocks.length;
      for (const b of col.blocks) col.group.remove(b);
      col.blocks = tower.blocks.map(([l, r], i) => {
        const b = giftBox((r - l) / W, RIBBONS[i % RIBBONS.length]!, i === 0);
        b.position.set(((l + r) / 2 - 50) / W, 0.3 + i + 0.46, 0);
        col.group.add(b);
        return b;
      });
      col.key = key;
      if (added && col.blocks.length > 1) {
        const top = col.blocks.at(-1)!;
        top.userData.drop = performance.now();
        const at = top.getWorldPosition(new THREE.Vector3()).setY(top.position.y);
        this.fx.burst(at, { count: 10, colors: [0xffe58a, 0xffffff], speed: 1.6, up: 0.4, life: 500 });
        const [l, r] = tower.blocks.at(-1)!;
        const [pl, pr] = tower.blocks.at(-2)!;
        if (Math.abs(l - pl) < 1.5 && Math.abs(r - pr) < 1.5) this.texts.add("Parfait !", at.clone().setY(at.y + 1.2), "#ffe58a", 0.6);
      }
    }
    if (tower.fell && !col.fell) {
      col.fell = true;
      col.fallAt = performance.now();
    }
    // Le cadeau qui se balance au-dessus de la pile.
    const n = tower.blocks.length;
    col.swing.visible = swingT !== null && !tower.done;
    col.rope.visible = col.swing.visible;
    if (col.swing.visible) {
      const [l, r] = tower.blocks.at(-1)!;
      const width = (r - l) / W;
      if (col.swing.userData.w !== width || col.swing.userData.n !== n) {
        col.swing.userData.w = width;
        col.swing.userData.n = n;
        for (const c of [...col.swing.children]) col.swing.remove(c);
        col.swing.add(giftBox(width, RIBBONS[n % RIBBONS.length]!));
      }
      const c = giftCenter(tower.gift, swingT!);
      col.swing.position.set((c - 50) / W, 0.3 + n + 1.5, 0);
      const top = new THREE.Vector3(col.group.position.x, 0.3 + n + 5, 0);
      const end = col.swing.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.46, 0));
      col.rope.position.copy(top.clone().lerp(end, 0.5));
      col.rope.scale.y = top.distanceTo(end);
      col.rope.rotation.z = Math.atan2(end.y - top.y, end.x - top.x) + Math.PI / 2;
    }
  }

  private tick(now: number, dt: number): void {
    let maxH = 1;
    for (const col of this.cols.values()) {
      maxH = Math.max(maxH, col.blocks.length);
      col.blocks.forEach((b, i) => {
        // Petit rebond du cadeau qui vient d'être posé.
        const d = b.userData.drop as number | undefined;
        if (d) {
          const t = Math.min(1, (now - d) / 260);
          b.scale.set(1 + (1 - t) * 0.12, 1 - (1 - t) * 0.18, 1);
        }
        // Tour ratée : les paquets s'écroulent.
        if (col.fell && i > 0) {
          const t = (now - col.fallAt) / 1000;
          b.rotation.z = Math.min(1.4, t * (i % 2 ? 1.6 : -1.6) * (i / col.blocks.length));
          b.position.y = Math.max(0.8, 0.3 + i + 0.46 - t * t * 4 * (i / col.blocks.length));
        }
      });
    }
    // La caméra suit le haut de la plus haute tour.
    const target = Math.max(2, Math.min(maxH, 9) + 1.5);
    this.camY += (target - this.camY) * Math.min(1, dt * 2);
    const spread = this.ids.length * GAP;
    const portrait = this.stage.aspect < 1;
    const d = Math.max(this.ids.length > 1 ? spread * 0.75 : 9, portrait ? 14 : 9);
    this.stage.look(new THREE.Vector3(0, this.camY + 2.5, d), new THREE.Vector3(0, this.camY, 0), true);
    this.fx.tick(now, dt);
    this.texts.tick(now);
  }

  destroy(): void {
    this.stage.dispose();
  }
}
