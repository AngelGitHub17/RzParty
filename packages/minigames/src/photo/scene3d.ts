/**
 * Photo souvenir en 3D : le modèle pose dans un petit studio (parapluies de photographe) ;
 * sa bouche passe de la grimace au grand sourire, et le flash éclate au déclic.
 */
import { smile, type PhotoParams } from "./logic.ts";
import { SideScene, type Timing3D } from "../three/timing3d.ts";
import { THREE, toon } from "../three/kit3d.ts";

/** Bouche pour un sourire `s` (0 à 1), en 20 niveaux gardés en mémoire. */
const mouths = new Map<number, THREE.ShapeGeometry>();
function mouthGeometry(s: number): THREE.ShapeGeometry {
  const level = Math.round(s * 20);
  let g = mouths.get(level);
  if (g) return g;
  const v = level / 20;
  const w = (40 + 35 * v) / 40;
  const curve = (-10 + 70 * v) / 40;
  const open = (4 + 30 * v * v) / 40;
  const shape = new THREE.Shape();
  shape.moveTo(-w, 0);
  shape.quadraticCurveTo(0, -curve, w, 0);
  shape.quadraticCurveTo(0, -curve - open, -w, 0);
  g = new THREE.ShapeGeometry(shape, 16);
  mouths.set(level, g);
  return g;
}

export default function create(host: HTMLElement): Timing3D<PhotoParams> {
  const s = new SideScene(host, 640, 320, { heroScale: 0.01 });
  s.heroPivot.visible = false;
  const scene = s.stage.scene;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), toon(0xffe3b0));
  wall.position.set(0, 4, -3);
  scene.add(wall);
  // Parapluies de photographe.
  for (const side of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 6), toon(0x3c3c46));
    stand.position.set(side * 6, 2.5, -1);
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.8, 16, 1, true), toon(0xffffff));
    (umbrella.material as THREE.Material).side = THREE.DoubleSide;
    umbrella.position.set(side * 6, 5.2, -1);
    umbrella.rotation.z = side * 0.6;
    scene.add(stand, umbrella);
  }
  // Le modèle : grosse tête, yeux, joues, bouche.
  const head = new THREE.Group();
  head.position.copy(s.map(320, 165));
  const skin = new THREE.Mesh(new THREE.SphereGeometry(110 / 40, 40, 30), toon(0xf7cba0));
  skin.scale.z = 0.7;
  const eyeMat = toon(0x1e2a4a);
  const eyes = [-1, 1].map((side) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), eyeMat);
    e.position.set((side * 40) / 40, 25 / 40, 1.85);
    head.add(e);
    return e;
  });
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xf28aa8, transparent: true, opacity: 0 });
  for (const side of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), cheekMat);
    c.position.set((side * 70) / 40, -20 / 40, 1.72);
    c.rotation.y = side * 0.5;
    head.add(c);
  }
  const mouth = new THREE.Mesh(mouthGeometry(0), toon(0xc0392b));
  mouth.position.set(0, -40 / 40, 1.95);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(110 / 40 + 0.05, 30, 16, 0, Math.PI * 2, 0, Math.PI / 3), toon(0x6b4423));
  hair.scale.z = 0.75;
  head.add(skin, mouth, hair);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 1, 8, 16), toon(0x2f7bef));
  body.position.copy(s.map(320, 330));
  scene.add(body, head);
  // Viseur et flash, collés devant la caméra.
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  flash.position.set(0, 4, 6);
  scene.add(flash);
  const corners = new THREE.Group();
  for (const [x, y, dx, dy] of [[150, 30, 1, 1], [490, 30, -1, 1], [150, 290, 1, -1], [490, 290, -1, -1]] as const) {
    const a = s.map(x, y, 3);
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    h1.position.copy(a).add(new THREE.Vector3((dx * 0.5 * 40) / 40, 0, 0));
    const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    v1.position.copy(a).add(new THREE.Vector3(0, -dy * 0.5, 0));
    corners.add(h1, v1);
  }
  scene.add(corners);
  s.stage.onTick(() => s.frame(1.02, 0.02));

  return {
    setPlayer: () => {},
    draw(t, p, pressedAt, phase) {
      const at = pressedAt ?? t;
      const sm = at === null || phase === "ready" ? 0.1 : smile(at, p) / 100;
      mouth.geometry = mouthGeometry(Math.max(0, Math.min(1, sm)));
      for (const e of eyes) e.scale.y = Math.max(0.35, 1 - 0.6 * sm);
      cheekMat.opacity = sm;
      head.rotation.z = Math.sin((t ?? 0) / 600) * 0.04;
      const since = pressedAt !== null && t !== null ? t - pressedAt : Infinity;
      (flash.material as THREE.MeshBasicMaterial).opacity = since < 300 ? 1 - since / 300 : 0;
    },
    destroy: () => s.destroy(),
  };
}
