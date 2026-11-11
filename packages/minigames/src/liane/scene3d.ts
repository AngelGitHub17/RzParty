/**
 * Liane folle en 3D : une branche au-dessus de la rivière, la liane qui se balance avec le personnage
 * accroché, la rive d'arrivée et ses repères ; éclaboussures si l'on tombe à l'eau.
 */
import { lianeScore, swing, type LianeParams } from "./logic.ts";
import { SideScene, type Timing3D } from "../three/timing3d.ts";
import { THREE, label, palm, sea, toon } from "../three/kit3d.ts";

const P = { x: 170, y: 20 };
const L = 190;

export default function create(host: HTMLElement): Timing3D<LianeParams> {
  const s = new SideScene(host, 640, 320, { heroScale: 0.8 });
  const scene = s.stage.scene;
  const water = sea(30, 0x2f7bef);
  water.mesh.position.copy(s.map(320, 262)).setZ(0);
  scene.add(water.mesh);
  // Les deux rives.
  const bankMat = toon(0x7ed957);
  const left = new THREE.Mesh(new THREE.BoxGeometry(s.map(130, 0).x - s.map(-200, 0).x, 2, 5), bankMat);
  left.position.copy(s.map(-35, 250)).setY(s.map(0, 250).y - 1);
  const right = new THREE.Mesh(new THREE.BoxGeometry(s.map(900, 0).x - s.map(355, 0).x, 2, 5), bankMat);
  right.position.copy(s.map(627, 250)).setY(s.map(0, 250).y - 1);
  scene.add(left, right);
  for (let m = 20; m <= 100; m += 20) {
    const x = 360 + (m - 15) * 3.2;
    const p = s.map(x, 250, 1.4);
    const tag = label(`${m} m`, { scale: 0.32, width: 256, height: 96 });
    tag.position.copy(p).setY(p.y + 0.3);
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), toon(0xffffff));
    peg.position.copy(p).setY(p.y + 0.2);
    scene.add(tag, peg);
  }
  for (const [x, z] of [[40, -1.5], [480, -1.8], [600, -1.2]] as const) {
    const t = palm(1.4);
    t.position.copy(s.map(x, 250, z));
    scene.add(t);
  }
  // La branche et la liane.
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 5, 10), toon(0x6b4423));
  branch.rotation.z = Math.PI / 2;
  branch.position.copy(s.map(180, 17));
  scene.add(branch);
  const top = s.map(P.x, P.y);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), toon(0x3fae49));
  scene.add(rope);
  const end = (angle: number) => ({ x: P.x + Math.sin(angle) * L, y: P.y + Math.cos(angle) * L });
  const setRope = (x: number, y: number) => {
    const bottom = s.map(x, y);
    rope.position.copy(top.clone().lerp(bottom, 0.5));
    rope.scale.y = top.distanceTo(bottom);
    rope.rotation.z = Math.atan2(bottom.y - top.y, bottom.x - top.x) + Math.PI / 2;
  };
  let splashed = false;
  s.stage.onTick(() => s.frame(1.02, 0.14));
  s.hero.face(new THREE.Vector3(10, 0, -2));

  return {
    setPlayer(look) {
      s.setPlayer(look);
      s.hero.face(new THREE.Vector3(10, 0, -2));
    },
    draw(t, p, pressedAt, phase) {
      const angle = t === null || phase === "ready" ? 0 : swing(pressedAt ?? t, p).angle;
      const ropeAngle = t === null || phase === "ready" ? 0 : swing(t, p).angle;
      const r = end(ropeAngle);
      setRope(r.x, r.y);
      if (pressedAt === null || t === null) {
        const h = end(angle);
        splashed = false;
        return s.placeHero(h.x, h.y + 30, 0);
      }
      const from = end(angle);
      const score = lianeScore(pressedAt, p);
      const flight = Math.min(1, (t - pressedAt) / 1000);
      const landX = score ? 360 + (score - 15) * 3.2 : from.x + 40;
      const landY = score ? 250 : 285;
      const x = from.x + (landX - from.x) * flight;
      const y = from.y + 30 + (landY - from.y - 30) * flight - Math.sin(Math.PI * flight) * score * 0.9;
      s.placeHero(x, y, 0);
      if (flight >= 1 && !splashed) {
        splashed = true;
        if (score) s.fx.burst(s.map(landX, 250), { count: 12, colors: [0xc9a36b, 0x7ed957], speed: 1.5, up: 0.6, life: 600 });
        else s.fx.burst(s.map(landX, 262), { count: 30, colors: [0x7fd3ff, 0xffffff], speed: 3, up: 1.6, gravity: 6, life: 900 });
      }
    },
    destroy: () => s.destroy(),
  };
}
