/**
 * Chamboule-tout en 3D : un stand de fête foraine (auvent rayé, comptoir, guirlande d'ampoules),
 * la pyramide de 6 boîtes, le viseur qui balaie, la balle lancée et les boîtes qui dégringolent.
 */
import { CANS, aimAt, cansDown, type ChambouleParams } from "./logic.ts";
import type { Timing3D } from "../three/timing3d.ts";
import { Character3D, FloatTexts, Particles, Stage3D, THREE, toon } from "../three/kit3d.ts";
import { normalizeAvatar } from "@rzparty/shared";

/** Largeur de balayage du viseur (unités 3D, de part et d'autre du centre). */
const SWEEP = 3.2;

export default function create(host: HTMLElement): Timing3D<ChambouleParams> {
  const stage = new Stage3D(host, { fov: 40 });
  const scene = stage.scene;
  const fx = new Particles();
  const texts = new FloatTexts();
  // Le stand.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 10), toon(0xd9a066));
  floor.position.y = -0.15;
  const back = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.2), toon(0x3d8bff));
  back.position.set(0, 2.5, -2.5);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 1.6), toon(0x8a5530));
  shelf.position.set(0, 1.2, -1.2);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 0.6), toon(0xffffff));
  counter.position.set(0, 0.3, 1.6);
  scene.add(floor, back, shelf, counter, fx.group, texts.group);
  for (let k = 0; k < 10; k++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, 2.2), toon(k % 2 ? 0xffffff : 0xf0483e));
    stripe.position.set(-4.5 + k + 0.5, 4.9, -1.4);
    stripe.rotation.x = 0.35;
    scene.add(stripe);
  }
  for (let k = 0; k < 12; k++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xffe58a, { emissive: 0xffc83d }));
    bulb.position.set(-4.4 + k * 0.8, 4.35 - Math.sin((k / 11) * Math.PI) * 0.3, -0.3);
    scene.add(bulb);
  }
  // Les boîtes (rangée du bas : 3, puis 2, puis 1).
  const cans: { mesh: THREE.Mesh; home: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3; down: boolean }[] = [];
  const pyramid = new THREE.Group();
  pyramid.position.set(0, 1.32, -1.2);
  scene.add(pyramid);
  const canColors = [0xf0483e, 0x3d8bff, 0xffc83d];
  [3, 2, 1].forEach((n, r) => {
    for (let k = 0; k < n; k++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.62, 16), toon(canColors[r]!));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.2, 16), toon(0xffffff));
      mesh.add(band);
      const home = new THREE.Vector3((k - (n - 1) / 2) * 0.62, 0.31 + r * 0.63, 0);
      mesh.position.copy(home);
      pyramid.add(mesh);
      cans.push({ mesh, home, vel: new THREE.Vector3(), spin: new THREE.Vector3(), down: false });
    }
  });
  // Le viseur et la balle.
  const sight = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xf0483e }));
  sight.position.set(0, 2, -0.3);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), toon(0xffffff));
  scene.add(sight, ball);
  // Le joueur, de dos, au premier plan.
  let hero = new Character3D(normalizeAvatar(undefined), { scale: 0.9 });
  hero.group.position.set(0, 0, 3.4);
  hero.face(new THREE.Vector3(0, 0, -5));
  scene.add(hero.group);
  let heroKey = "";
  let throwKey = "";
  let lastT = 0;
  stage.onTick((now, dt) => {
    hero.tick(now);
    fx.tick(now, dt);
    texts.tick(now);
    for (const c of cans) {
      if (!c.down) continue;
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      // Elles rebondissent sur le sol du stand.
      const floorY = -1.32 + 0.3;
      if (c.mesh.position.y < floorY) {
        c.mesh.position.y = floorY;
        c.vel.multiplyScalar(0.4);
        c.vel.y = Math.abs(c.vel.y) * 0.3;
      }
    }
  });
  const portrait = stage.aspect < 1;
  stage.look(new THREE.Vector3(0, portrait ? 3.4 : 2.7, portrait ? 10 : 6.6), new THREE.Vector3(0, 2, -1), true);

  const reset = () => {
    for (const c of cans) {
      c.down = false;
      c.mesh.position.copy(c.home);
      c.mesh.rotation.set(0, 0, 0);
    }
  };

  return {
    setPlayer(look) {
      const key = JSON.stringify(look?.avatar) + Boolean(look?.isBot);
      if (key === heroKey) return;
      heroKey = key;
      scene.remove(hero.group);
      hero.dispose();
      hero = new Character3D(normalizeAvatar(look?.avatar), { bot: look?.isBot, scale: 0.9 });
      hero.group.position.set(0, 0, 3.4);
      hero.face(new THREE.Vector3(0, 0, -5));
      scene.add(hero.group);
    },
    draw(t, p, pressedAt, phase, spectator) {
      pyramid.position.x = p.center * SWEEP;
      const now = t ?? 0;
      if (phase === "ready" || t === null || now < lastT - 50) {
        reset();
        throwKey = "";
      }
      lastT = now;
      const aimT = pressedAt ?? now;
      sight.position.x = aimAt(phase === "ready" ? 0 : aimT, p) * SWEEP;
      sight.visible = phase !== "result" || pressedAt !== null;
      const fly = pressedAt === null || spectator ? -1 : Math.min(1, (now - pressedAt) / 380);
      ball.visible = fly >= 0 && fly < 1;
      if (fly >= 0) {
        const from = new THREE.Vector3(0.3, 1.3, 3.2);
        const to = new THREE.Vector3(sight.position.x, 2, -1.1);
        ball.position.lerpVectors(from, to, fly);
        ball.position.y += Math.sin(fly * Math.PI) * 0.8;
      }
      const key = `${p.period}:${pressedAt}`;
      if (fly >= 1 && key !== throwKey) {
        throwKey = key;
        const down = cansDown(pressedAt, p);
        // On fait tomber les boîtes du haut d'abord.
        [...cans].reverse().slice(0, down).forEach((c) => {
          c.down = true;
          c.vel.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, -1 - Math.random());
          c.spin.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
        });
        const at = new THREE.Vector3(sight.position.x, 2.2, -1);
        if (down === CANS) {
          fx.burst(at, { count: 40, colors: [0xffc83d, 0xf45fae, 0x3d8bff, 0x3dbe5b], speed: 4, up: 1.2, gravity: 3, life: 1300, size: 0.25 });
          texts.add("Tout par terre !", at.clone().setY(3.4), "#ffe58a", 0.7);
          hero.cheer(1500);
        } else if (down === 0) texts.add("Raté !", at.clone().setY(3.2), "#ff6a5e", 0.6);
        else texts.add(`${down} boîte${down > 1 ? "s" : ""}`, at.clone().setY(3.2), "#ffffff", 0.6);
      }
    },
    destroy: () => {
      hero.dispose();
      stage.dispose();
    },
  };
}
