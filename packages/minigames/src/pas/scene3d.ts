/**
 * Pas comptés en 3D : le personnage marche sur un chemin de campagne (le décor défile), ses traces
 * restent derrière lui ; après quelques pas, un épais brouillard cache tout.
 */
import type { PasParams } from "./logic.ts";
import { SideScene, type Timing3D } from "../three/timing3d.ts";
import { THREE, label, toon, tree } from "../three/kit3d.ts";

const SPACING = 34;

export default function create(host: HTMLElement): Timing3D<PasParams> {
  const s = new SideScene(host, 640, 240, { heroScale: 1.1 });
  const scene = s.stage.scene;
  const world = new THREE.Group();
  scene.add(world);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 10), toon(0x7ed957));
  ground.position.set(-80, s.map(0, 182).y - 0.5, 0);
  const path = new THREE.Mesh(new THREE.BoxGeometry(200, 0.02, 1.4), toon(0xe9d3a5));
  path.position.set(-80, s.map(0, 182).y + 0.01, 0);
  world.add(ground, path);
  for (let k = 0; k < 40; k++) {
    const t = tree(1 + (k % 3) * 0.3, k % 2 ? 0x2f9a44 : 0x3fae49);
    t.position.set(6 - k * 3.1, s.map(0, 182).y, -2.5 - (k % 3));
    world.add(t);
  }
  const prints = new THREE.Group();
  scene.add(prints);
  const printMat = toon(0xb38b57);
  // Le brouillard : un grand voile blanc devant la scène.
  const fog = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ color: 0xeef3f8, transparent: true, opacity: 0, depthWrite: false }));
  fog.position.set(0, 3, 3);
  scene.add(fog);
  let counter: THREE.Sprite | null = null;
  let counterText = "";
  let printed = -1;
  s.hero.face(new THREE.Vector3(10, 0, 0));
  s.stage.onTick(() => s.frame(1.0, 0.2));

  return {
    setPlayer(look) {
      s.setPlayer(look);
      s.hero.face(new THREE.Vector3(10, 0, 0));
    },
    draw(t, p, pressedAt, phase) {
      const steps = t === null || phase === "ready" ? 0 : (pressedAt ?? t) / p.pace;
      const whole = Math.floor(steps);
      // Le décor défile vers l'arrière, le marcheur reste au milieu en se balançant.
      world.position.x = (steps * SPACING) / 40;
      s.placeHero(320, 182 - Math.abs(Math.sin(steps * Math.PI)) * 4, Math.sin(steps * Math.PI) * 4);
      if (whole !== printed) {
        printed = whole;
        for (const c of [...prints.children]) {
          prints.remove(c);
          (c as THREE.Mesh).geometry.dispose();
        }
        for (let i = 0; i < whole && i < 14; i++) {
          const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), printMat);
          fp.scale.z = 0.55;
          fp.position.copy(s.map(320 - (i + 1) * SPACING + (steps - whole) * 0, 182, i % 2 ? -0.25 : 0.25)).setY(s.map(0, 182).y + 0.03);
          prints.add(fp);
        }
      }
      const hidden = phase === "run" && pressedAt === null && steps >= p.visible;
      const fm = fog.material as THREE.MeshBasicMaterial;
      fm.opacity += ((hidden ? 0.97 : 0) - fm.opacity) * 0.15;
      const text = phase === "ready" || t === null ? "" : hidden ? "?" : phase === "result" ? `${steps.toFixed(1).replace(".", ",")} pas` : `${whole} pas`;
      if (text !== counterText) {
        counterText = text;
        if (counter) {
          scene.remove(counter);
          counter.material.map?.dispose();
          counter.material.dispose();
          counter = null;
        }
        if (text) {
          counter = label(text, { scale: 1, width: 384, height: 128 });
          counter.position.copy(s.map(320, 50)).setZ(3.2);
          scene.add(counter);
        }
      }
    },
    destroy: () => s.destroy(),
  };
}
