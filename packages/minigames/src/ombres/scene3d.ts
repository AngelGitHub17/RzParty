/**
 * Ombres chinoises en 3D : une pièce sombre, une lampe à gauche qui éclaire un grand drap blanc,
 * l'ombre noire de l'objet sur le drap. À la révélation, l'objet apparaît en couleur entre la lampe
 * et le drap, la lumière se rallume et des étincelles jaillissent.
 */
import { FloatTexts, Particles, Stage3D, THREE, label, toon } from "../three/kit3d.ts";
import { SHADOW_THINGS, type OmbresState } from "./types.ts";

export class OmbresScene {
  private readonly stage: Stage3D;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly sheet: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private shadow: THREE.Sprite | null = null;
  private object: THREE.Sprite | null = null;
  private key = "";
  private revealKey = "";
  private revealAt = 0;
  private tilt = 0;
  private mirror = 1;

  constructor(host: HTMLElement) {
    this.stage = new Stage3D(host, { fov: 40, background: 0x1b1630 });
    const scene = this.stage.scene;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 10), toon(0x3a2f55));
    floor.position.y = -0.1;
    // Le drap tendu sur son cadre.
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
    this.sheet.position.set(0.8, 2.3, -1.5);
    const frameMat = toon(0x6b4423);
    for (const [x, y, w, h] of [[0.8, 4.35, 6.8, 0.18], [0.8, 0.25, 6.8, 0.18], [-2.5, 2.3, 0.18, 4.2], [4.1, 2.3, 0.18, 4.2]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), frameMat);
      bar.position.set(x, y, -1.45);
      scene.add(bar);
    }
    // La lampe et son faisceau.
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), toon(0x3c3c46));
    foot.position.set(-4.8, 1.1, 2.4);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 16, 1, true), toon(0xf0483e));
    head.position.set(-4.6, 2.4, 2.3);
    head.rotation.z = -1.2;
    head.rotation.y = -0.5;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    bulb.position.set(-4.35, 2.35, 2.15);
    this.beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 6.8, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.set(-1.4, 2.35, 0.3);
    this.beam.lookAt(new THREE.Vector3(0.8, 2.3, -1.5));
    this.beam.rotateX(Math.PI / 2);
    scene.add(floor, this.sheet, foot, head, bulb, this.beam, this.fx.group, this.texts.group);
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0.2, 2.6, portrait ? 12 : 8.2), new THREE.Vector3(0.4, 2.2, -1), true);
  }

  private clearSprite(s: THREE.Sprite | null): void {
    if (!s) return;
    this.stage.scene.remove(s);
    s.material.map?.dispose();
    s.material.dispose();
  }

  update(s: OmbresState): void {
    const key = `${s.round}:${s.shadow}`;
    if (key !== this.key) {
      this.key = key;
      this.clearSprite(this.shadow);
      this.clearSprite(this.object);
      this.shadow = null;
      this.object = null;
      if (s.shadow !== null) {
        const emoji = SHADOW_THINGS[s.shadow]!;
        // L'ombre : l'image teintée en noir (la couleur du matériau multiplie la texture).
        this.shadow = label(emoji, { scale: 2.6, width: 256, height: 256, outline: "rgba(0,0,0,0)" });
        this.shadow.material.color.setHex(0x000000);
        this.shadow.material.opacity = 0.88;
        this.shadow.position.set(0.8, 2.3, -1.42);
        this.tilt = (s.tilt * Math.PI) / 180;
        this.mirror = s.mirror ? -1 : 1;
        this.shadow.material.rotation = -this.tilt;
        this.shadow.scale.x *= this.mirror;
        this.stage.scene.add(this.shadow);
        // L'objet, caché jusqu'à la révélation.
        this.object = label(emoji, { scale: 1.3, width: 256, height: 256, outline: "rgba(0,0,0,0)" });
        this.object.position.set(-1.6, 2.3, 0.9);
        this.object.material.rotation = -this.tilt;
        this.object.scale.x *= this.mirror;
        this.object.visible = false;
        this.stage.scene.add(this.object);
      }
    }
    const reveal = s.phase === "reveal" ? key : "";
    if (reveal && reveal !== this.revealKey) {
      this.revealKey = reveal;
      this.revealAt = performance.now();
      if (this.object) {
        this.object.visible = true;
        this.fx.burst(this.object.position.clone(), { count: 30, colors: [0xffe58a, 0xffffff, 0xf45fae], speed: 2.5, up: 0.6, gravity: 1.5, life: 1100, size: 0.18 });
      }
      if (s.correct[0]) this.texts.add("Bien vu !", new THREE.Vector3(0.8, 4, -1), "#ffe58a", 0.6);
    }
  }

  private tick(now: number, dt: number): void {
    this.fx.tick(now, dt);
    this.texts.tick(now);
    // L'ombre tremble un peu (comme une vraie main devant la lampe).
    if (this.shadow) {
      this.shadow.position.x = 0.8 + Math.sin(now / 700) * 0.05;
      this.shadow.material.rotation = -this.tilt + Math.sin(now / 900) * 0.03;
    }
    if (this.object?.visible) {
      const k = Math.min(1, (now - this.revealAt) / 400);
      this.object.position.y = 2.3 + Math.sin(now / 400) * 0.08;
      this.object.material.opacity = k;
    }
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.07 + Math.sin(now / 300) * 0.01;
  }

  destroy(): void {
    this.stage.dispose();
  }
}
