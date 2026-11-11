/**
 * Cornet glacé en 3D : le comptoir d'un glacier (bacs de parfums, store rose), un grand cornet en gaufre
 * sur son présentoir. Pendant la commande, les boules s'empilent une à une ; pendant la fabrication,
 * c'est mon cornet qui monte boule après boule ; à la révélation, la commande réapparaît.
 */
import { FloatTexts, Particles, Stage3D, THREE, toon } from "../three/kit3d.ts";
import { FLAVORS, type GlacesState } from "./types.ts";

export class GlacesScene {
  private readonly stage: Stage3D;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly cone = new THREE.Group();
  private scoops: THREE.Mesh[] = [];
  private shown = "";
  private bornAt: number[] = [];
  private resultKey = "";

  constructor(host: HTMLElement) {
    this.stage = new Stage3D(host, { fov: 38 });
    const scene = this.stage.scene;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 8), toon(0xf7e3c8));
    floor.position.y = -0.1;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 2.2), toon(0xff8fb5));
    counter.position.set(0, 0.8, -2.4);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 2), new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.4 }));
    glass.position.set(0, 1.85, -2.4);
    scene.add(floor, counter, glass);
    FLAVORS.forEach((f, i) => {
      const tub = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.9), toon(new THREE.Color(f.hex).getHex()));
      tub.position.set(-3.4 + i * 1.36, 1.72, -2.4);
      scene.add(tub);
    });
    for (let k = 0; k < 9; k++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1.6), toon(k % 2 ? 0xffffff : 0xff6fa0));
      stripe.position.set(-4 + k, 4.2, -2.6);
      stripe.rotation.x = 0.4;
      scene.add(stripe);
    }
    // Le cornet (gaufre) sur son présentoir.
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.4, 24), toon(0xffffff));
    stand.position.y = 0.2;
    const wafer = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 24), toon(0xe0a35c));
    wafer.rotation.x = Math.PI;
    wafer.position.y = 1.2;
    const grid = new THREE.Mesh(new THREE.ConeGeometry(0.56, 1.6, 8, 4, true), new THREE.MeshBasicMaterial({ color: 0xb87a3a, wireframe: true }));
    grid.rotation.x = Math.PI;
    grid.position.y = 1.2;
    this.cone.add(stand, wafer, grid);
    this.cone.position.set(0, 0, 0.6);
    scene.add(this.cone, this.fx.group, this.texts.group);
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, 3, portrait ? 9 : 6), new THREE.Vector3(0, 2.4, 0), true);
  }

  /** `mine` : mes boules pendant la fabrication ; `device` : cet écran est celui d'un joueur. */
  update(s: GlacesState, mine: number[], device: boolean): void {
    const list = s.order ?? (s.phase === "build" && device ? mine : []);
    const key = list.join(",") + `|${s.round}|${s.phase === "build" ? "b" : "o"}`;
    if (key !== this.shown) {
      const keep = this.shown.split("|")[1] === String(s.round) && this.shown.split("|")[2] === (s.phase === "build" ? "b" : "o") ? Math.min(this.scoops.length, list.length) : 0;
      this.shown = key;
      // On garde les boules déjà posées, on ajoute (ou enlève) les autres.
      for (const m of this.scoops.splice(keep)) this.cone.remove(m);
      this.bornAt.splice(keep);
      const now = performance.now();
      list.slice(keep).forEach((f, j) => {
        const i = keep + j;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), toon(new THREE.Color(FLAVORS[f]!.hex).getHex()));
        m.scale.set(1, 0.85, 1);
        m.position.set(Math.sin(i * 1.7) * 0.05, 2.2 + i * 0.82, 0);
        this.cone.add(m);
        this.scoops.push(m);
        // Pendant la commande, les boules arrivent une à une.
        this.bornAt.push(now + (s.phase === "show" ? i * 250 : 0));
      });
    }
    const rk = s.phase === "reveal" ? `${s.round}` : "";
    if (rk && rk !== this.resultKey) {
      this.resultKey = rk;
      if (s.correct.length) {
        this.fx.burst(new THREE.Vector3(0, 2.6 + (s.order?.length ?? 3) * 0.82, 0.6), { count: 30, colors: [0xff8fb5, 0xffe14d, 0xa8d86e, 0xffffff], speed: 3, up: 1.4, gravity: 3, life: 1200, size: 0.2 });
        this.texts.add("Miam !", new THREE.Vector3(1.6, 3.6, 0.6), "#ff6fa0", 0.7);
      }
    }
  }

  private tick(now: number, dt: number): void {
    this.fx.tick(now, dt);
    this.texts.tick(now);
    this.scoops.forEach((m, i) => {
      const t = Math.max(0, Math.min(1, (now - this.bornAt[i]!) / 280));
      m.visible = now >= this.bornAt[i]!;
      // La boule tombe du haut et s'écrase un peu.
      m.position.y = 2.2 + i * 0.82 + (1 - t) * 1.5;
      m.scale.set(1 + (t >= 1 ? 0 : 0.1 * t), 0.85 - (t >= 1 ? 0 : 0.1 * t), 1);
    });
    this.cone.rotation.y = Math.sin(now / 1200) * 0.25;
    void dt;
    // La caméra monte avec le cornet.
    // On cadre tout le cornet, de la gaufre à la dernière boule.
    const n = Math.max(3, this.scoops.length);
    const top = 1.7 + n * 0.41;
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, top + 0.5, (portrait ? 8 : 4.6) + n * (portrait ? 1 : 0.75)), new THREE.Vector3(0, top, 0));
  }

  destroy(): void {
    this.stage.dispose();
  }
}
