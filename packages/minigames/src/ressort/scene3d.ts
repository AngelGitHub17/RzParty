/**
 * Ressort en 3D : un vrai ressort hélicoïdal qui se comprime et se détend, le personnage posé dessus,
 * et la jauge d'élan à côté ; on s'envole d'autant plus haut que l'élan est bon.
 */
import { elan, ressortScore, spring, type RessortParams } from "./logic.ts";
import { SideScene, type Timing3D } from "../three/timing3d.ts";
import { THREE, label, toon } from "../three/kit3d.ts";

export default function create(host: HTMLElement): Timing3D<RessortParams> {
  const s = new SideScene(host, 640, 300, { heroScale: 1 });
  const scene = s.stage.scene;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 8), toon(0x7ed957));
  ground.position.copy(s.map(320, 270)).setY(s.map(0, 270).y - 0.5);
  scene.add(ground);
  // Le ressort : une hélice dont on change la hauteur.
  const base = s.map(300, 268);
  const helix: THREE.Vector3[] = [];
  for (let k = 0; k <= 320; k++) {
    const t = k / 320;
    const a = t * Math.PI * 2 * 8;
    helix.push(new THREE.Vector3(Math.cos(a) * 0.8, t, Math.sin(a) * 0.8));
  }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 400, 0.09, 8, false), toon(0x8f9bb3));
  coil.position.copy(base);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.18, 24), toon(0xf0483e));
  scene.add(coil, plate);
  // La jauge d'élan (la zone dorée en haut est la bonne).
  const gaugeX = s.map(578, 0).x;
  const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 220 / 40, 0.3), toon(0xffffff));
  gauge.position.set(gaugeX, s.map(0, 150).y, 0);
  const gold = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1, 0.32), toon(0xffc83d));
  gold.position.set(gaugeX, s.map(0, 60).y, 0.01);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.4), toon(0x1e2a4a));
  scene.add(gauge, gold, needle);
  let elanTag: THREE.Sprite | null = null;
  let elanText = "";
  let heightTag: THREE.Sprite | null = null;
  let heightText = "";
  const setTag = (old: THREE.Sprite | null, text: string, at: THREE.Vector3, scale: number) => {
    if (old) {
      scene.remove(old);
      old.material.map?.dispose();
      old.material.dispose();
    }
    if (!text) return null;
    const tag = label(text, { scale, width: 320, height: 96 });
    tag.position.copy(at);
    scene.add(tag);
    return tag;
  };
  s.stage.onTick(() => s.frame(1.02, 0.15));

  const setCoil = (topY: number) => {
    const top = s.map(300, topY);
    const h = Math.max(0.4, top.y - base.y);
    coil.scale.y = h;
    plate.position.copy(top);
  };

  return {
    setPlayer: (look) => s.setPlayer(look),
    draw(t, p, pressedAt, phase) {
      const live = t === null || phase === "ready" ? 0 : spring(pressedAt ?? t, p);
      needle.position.set(gaugeX, s.map(0, 256 - live * 216).y, 0.2);
      const eText = t === null || phase === "ready" ? "×1.00" : `×${elan(pressedAt ?? t, p).toFixed(2)}`;
      if (eText !== elanText) {
        elanText = eText;
        elanTag = setTag(elanTag, eText, s.map(578, 22), 0.45);
      }
      let hText = "";
      if (pressedAt === null || t === null) {
        const top = 260 - 120 * (1 - live) - 40;
        setCoil(top);
        s.placeHero(300, top - 4, 0);
      } else {
        const score = ressortScore(pressedAt, p);
        const flight = Math.min(1, (t - pressedAt) / 1200);
        const peak = Math.min(150, 10 + score * 0.9);
        setCoil(100);
        s.placeHero(300, 100 - 4 - Math.sin(Math.PI * flight) * peak, flight * 360 * (score > 80 ? 1 : 0));
        hText = score ? `${score} m` : "Raté !";
      }
      if (hText !== heightText) {
        heightText = hText;
        heightTag = setTag(heightTag, hText, s.map(160, 50), 0.7);
      }
    },
    destroy: () => s.destroy(),
  };
}
