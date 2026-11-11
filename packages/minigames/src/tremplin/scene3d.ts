/**
 * Grand tremplin en 3D : le tremplin en bois, la piste enneigée avec ses repères de distance,
 * des sapins, et le personnage du joueur sur ses skis (mêmes trajectoires que le dessin 2D).
 */
import { tremplinScore, type TremplinParams } from "./logic.ts";
import { SideScene, type Timing3D } from "../three/timing3d.ts";
import { THREE, label, toon, tree } from "../three/kit3d.ts";

const A = { x: 30, y: 50 };
const B = { x: 300, y: 200 };

export default function create(host: HTMLElement): Timing3D<TremplinParams> {
  const s = new SideScene(host, 640, 300, { heroScale: 0.75 });
  const scene = s.stage.scene;
  scene.background = null;
  // Le tremplin : une planche en pente sur des piliers.
  const a = s.map(A.x, A.y);
  const b = s.map(B.x, B.y);
  const len = a.distanceTo(b);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, 1.6), toon(0x9a6542));
  ramp.position.copy(a.clone().lerp(b, 0.5)).setY((a.y + b.y) / 2 - 0.15);
  ramp.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
  scene.add(ramp);
  for (let k = 0; k <= 4; k++) {
    const p = a.clone().lerp(b, k / 4);
    const h = p.y - 0.2;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), toon(0x6b4423));
    pillar.position.set(p.x, h / 2 - 0.2, 0);
    scene.add(pillar);
  }
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 1.7), toon(0xf0483e));
  lip.position.copy(b).setY(b.y + 0.05);
  scene.add(lip);
  // La piste d'atterrissage (même courbe que le dessin 2D), en relief.
  const hill = new THREE.Shape();
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    // Courbe de Bézier M300 200 Q470 220 640 290.
    const x = (1 - t) * (1 - t) * 300 + 2 * (1 - t) * t * 470 + t * t * 640;
    const y = (1 - t) * (1 - t) * 200 + 2 * (1 - t) * t * 220 + t * t * 290;
    pts.push(s.map(x, y));
  }
  hill.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts) hill.lineTo(p.x, p.y);
  hill.lineTo(pts.at(-1)!.x, -1);
  hill.lineTo(s.map(0, 230).x, -1);
  hill.lineTo(s.map(0, 230).x, s.map(0, 230).y);
  hill.lineTo(pts[0]!.x, pts[0]!.y);
  const snow = new THREE.Mesh(new THREE.ExtrudeGeometry(hill, { depth: 4, bevelEnabled: false }), toon(0xf4fbff));
  snow.position.z = -2;
  scene.add(snow);
  // Repères de distance.
  for (let m = 60; m <= 140; m += 20) {
    const x = 300 + (m - 40) * 3.1;
    const y = 200 + ((x - 300) / 340) * 70;
    const p = s.map(x, y, 1.2);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), toon(m >= 120 ? 0xf0483e : 0x2f7bef));
    flag.position.copy(p).setY(p.y + 0.25);
    const tag = label(`${m} m`, { scale: 0.32, width: 256, height: 96 });
    tag.position.copy(p).setY(p.y + 0.8);
    scene.add(flag, tag);
  }
  for (let k = 0; k < 8; k++) {
    const t = tree(0.9 + (k % 3) * 0.25, 0x2f7a44);
    const x = 330 + k * 40;
    t.position.copy(s.map(x, 200 + ((x - 300) / 340) * 70 + 4, -1.6 - (k % 2)));
    scene.add(t);
  }
  // Skis sous le personnage.
  const skis = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.5), toon(0x1e2a4a));
  s.heroPivot.add(skis);
  s.hero.face(new THREE.Vector3(10, 0, 0));
  const slope = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  let lastPlayer = s.hero;
  s.stage.onTick(() => s.frame(1.02, 0.12));

  return {
    setPlayer(look) {
      s.setPlayer(look);
      if (s.hero !== lastPlayer) {
        lastPlayer = s.hero;
        s.hero.face(new THREE.Vector3(10, 0, 0));
      }
    },
    draw(t, p, pressedAt, phase, spectator) {
      const place = (x: number, y: number, rot: number) => s.placeHero(x, y - 2, rot);
      if (t === null || phase === "ready") return place(A.x, A.y, slope);
      if (spectator && pressedAt === null) {
        const along = Math.min(1, Math.pow(Math.min(t, p.ramp) / p.ramp, 2));
        return place(A.x + (B.x - A.x) * along, A.y + (B.y - A.y) * along, slope);
      }
      const jumpAt = pressedAt ?? t;
      const along = Math.min(1, Math.pow(Math.min(jumpAt, p.ramp) / p.ramp, 2));
      const sx = A.x + (B.x - A.x) * along;
      const sy = A.y + (B.y - A.y) * along;
      if (pressedAt === null && t <= p.ramp) return place(sx, sy, slope);
      const score = tremplinScore(pressedAt, p);
      const flight = Math.min(1, (t - Math.min(jumpAt, p.ramp)) / 1100);
      if (score === 0) return place(B.x + flight * 60, B.y + flight * 80, 180 * flight + slope);
      const landX = 300 + (score - 40) * 3.1;
      const landY = 200 + ((landX - 300) / 340) * 70;
      const x = sx + (landX - sx) * flight;
      const y = sy + (landY - sy) * flight - Math.sin(Math.PI * flight) * (40 + score * 0.6);
      place(x, y, 10 - 20 * flight);
      // Gerbe de neige à l'atterrissage.
      if (flight >= 1 && !s.heroPivot.userData.landed) {
        s.heroPivot.userData.landed = true;
        s.fx.burst(s.map(landX, landY), { count: 18, colors: [0xffffff, 0xdff3ff], speed: 2, up: 0.8, life: 700 });
      }
      if (flight < 1) s.heroPivot.userData.landed = false;
    },
    destroy: () => s.destroy(),
  };
}
