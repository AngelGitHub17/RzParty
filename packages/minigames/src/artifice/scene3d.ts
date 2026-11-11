/**
 * Feu d'artifice en 3D : une place de village la nuit (maisons aux fenêtres allumées, lampions),
 * le personnage du joueur avec son allumette, la fusée qui file en laissant des étincelles,
 * et l'éclat en gerbe de couleur (plus il est près du sommet, plus il est grand).
 */
import { ARTIFICE_COLORS, artificeScore, landingAt, rocketHeight, type ArtificeParams } from "./logic.ts";
import { SideScene, type Timing3D } from "../three/timing3d.ts";
import { THREE, toon } from "../three/kit3d.ts";

export default function create(host: HTMLElement): Timing3D<ArtificeParams> {
  const s = new SideScene(host, 400, 300, { heroScale: 0.8, fov: 42 });
  const scene = s.stage.scene;
  scene.background = new THREE.Color(0x141b3d);
  // Étoiles.
  const starGeo = new THREE.BufferGeometry();
  const pts: number[] = [];
  for (let k = 0; k < 160; k++) pts.push((Math.random() - 0.5) * 30, 2 + Math.random() * 12, -6 - Math.random() * 4);
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })));
  // Sol et maisons.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 8), toon(0x23305e));
  ground.position.set(0, s.map(0, 270).y - 0.2, -1);
  scene.add(ground);
  const houseColors = [0xffcf8a, 0xf7a8c4, 0xa8d8f7, 0xc9f7a8];
  for (let k = 0; k < 6; k++) {
    const w = 1.6 + (k % 2) * 0.6;
    const hgt = 1.4 + (k % 3) * 0.5;
    const x = -7 + k * 2.8;
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 1.2), toon(houseColors[k % 4]!, { emissive: 0x1a1a30 }));
    house.position.set(x, ground.position.y + 0.2 + hgt / 2, -3);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, 0.7, 4), toon(0x8a3a2e));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, ground.position.y + 0.2 + hgt + 0.35, -3);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.05), toon(0xffe58a, { emissive: 0xffc83d }));
    win.position.set(x, ground.position.y + 0.2 + hgt * 0.6, -2.38);
    scene.add(house, roof, win);
  }
  // Lampions sur un fil.
  for (let k = 0; k < 9; k++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), toon(ARTIFICE_COLORS[k % ARTIFICE_COLORS.length]!, { emissive: ARTIFICE_COLORS[k % ARTIFICE_COLORS.length]! }));
    lamp.position.set(-6 + k * 1.5, ground.position.y + 2.9 + Math.sin(k) * 0.15, -1.8);
    scene.add(lamp);
  }
  // La fusée.
  const rocket = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 10), toon(0xf0483e));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 10), toon(0xffc83d));
  tip.position.y = 0.42;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), toon(0xc9a36b));
  stick.position.set(0.12, -0.5, 0);
  rocket.add(body, tip, stick);
  scene.add(rocket);
  s.hero.face(new THREE.Vector3(0, 0, 10));
  let lastHero = s.hero;
  let boomRound = "";
  let sparkAt = 0;
  s.stage.onTick(() => s.frame(1.0, 0.08));

  return {
    setPlayer(look) {
      s.setPlayer(look);
      if (s.hero !== lastHero) {
        lastHero = s.hero;
        s.hero.face(new THREE.Vector3(0, 0, 10));
      }
    },
    draw(t, p, pressedAt, phase, spectator) {
      s.placeHero(120, 270, 0, 0.6);
      const base = s.map(200, 270, 0);
      if (t === null || phase === "ready") {
        rocket.visible = true;
        rocket.position.copy(base).setY(base.y + 0.4);
        boomRound = "";
        return;
      }
      const at = spectator || pressedAt === null ? Math.min(t, landingAt(p)) : pressedAt;
      const h = rocketHeight(at, p);
      const pos = s.map(200, 270 - h * 240, 0);
      const score = pressedAt === null ? 0 : artificeScore(pressedAt, p);
      const exploded = pressedAt !== null && t >= pressedAt && score > 0;
      rocket.visible = !exploded && t < landingAt(p) + 200;
      rocket.position.copy(pos).setY(pos.y + 0.4);
      // Elle penche en redescendant.
      rocket.rotation.z = at > p.peak ? Math.min(Math.PI, ((at - p.peak) / p.peak) * Math.PI) : 0;
      const now = performance.now();
      if (rocket.visible && t > 0 && now - sparkAt > 40) {
        sparkAt = now;
        s.fx.burst(rocket.position.clone().add(new THREE.Vector3(0, -0.3, 0)), { count: 2, colors: [0xffc83d, 0xff8a1f], speed: 0.6, up: -0.5, gravity: 2, life: 500, size: 0.1 });
      }
      const key = `${p.peak}:${pressedAt}`;
      if (exploded && key !== boomRound) {
        boomRound = key;
        const color = ARTIFICE_COLORS[p.color] ?? 0xffffff;
        const big = 0.4 + score / 100;
        s.fx.burst(pos, { count: Math.round(40 + score), colors: [color, 0xffffff, color], speed: 5 * big, up: 0, gravity: 1.2, life: 1600, size: 0.18 + big * 0.1 });
        if (score >= 90) s.fx.burst(pos, { count: 30, colors: [0xffe58a], speed: 2.5, up: 0, gravity: 0.8, life: 2000, size: 0.14 });
        s.hero.cheer(1200);
      }
    },
    destroy: () => s.destroy(),
  };
}
