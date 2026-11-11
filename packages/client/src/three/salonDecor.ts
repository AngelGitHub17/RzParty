/**
 * Le salon en 3D, décor commun des jeux de salon (Cris en folie, Cache-cache, Tic-tac-boum) :
 * parquet, tapis rond, deux murs avec fenêtre et cadres, canapé, buffet, lampe, plante et télé.
 * Renvoie aussi des « cachettes » (points près des meubles) pour Cache-cache.
 */
import { THREE, toon } from "./kit3d.ts";

export interface SalonDecor {
  group: THREE.Group;
  /** Points près des meubles, où l'on peut cacher un téléphone. */
  spots: THREE.Vector3[];
}

export function salonDecor(opts: { rug?: number } = {}): SalonDecor {
  const g = new THREE.Group();
  // Parquet en lames.
  for (let k = 0; k < 9; k++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(18, 0.2, 2), toon(k % 2 ? 0xd9a066 : 0xcf9459));
    plank.position.set(0, -0.1, -8 + k * 2);
    g.add(plank);
  }
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.04, 48), toon(opts.rug ?? 0x5ec7c0));
  rug.position.y = 0.02;
  const rugBorder = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.08, 6, 64), toon(0xffffff));
  rugBorder.rotation.x = Math.PI / 2;
  rugBorder.position.y = 0.05;
  g.add(rug, rugBorder);
  // Murs (fond et gauche).
  const wallMat = toon(0xfff1d6);
  const back = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 0.3), wallMat);
  back.position.set(0, 3, -8.1);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 16), wallMat);
  left.position.set(-9, 3, 0);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 0.36), toon(0xffffff));
  plinth.position.set(0, 0.17, -7.95);
  g.add(back, left, plinth);
  // Fenêtre avec le ciel.
  const sky = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 0.1), toon(0x9fd8ff, { emissive: 0x3a7ab0 }));
  sky.position.set(-4.5, 3.4, -7.9);
  const frameMat = toon(0xffffff);
  for (const [x, y, w, h] of [[-4.5, 4.55, 3.7, 0.18], [-4.5, 2.25, 3.7, 0.18], [-6.3, 3.4, 0.18, 2.4], [-2.7, 3.4, 0.18, 2.4], [-4.5, 3.4, 0.12, 2.3]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), frameMat);
    bar.position.set(x, y, -7.85);
    g.add(bar);
  }
  g.add(sky);
  // Cadres colorés.
  for (const [x, c] of [[1.5, 0xf45fae], [3.2, 0xffc83d], [4.9, 0x3d8bff]] as const) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.08), toon(0x5a3418));
    frame.position.set(x, 3.8, -7.9);
    const art = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.04), toon(c));
    art.position.set(x, 3.8, -7.84);
    g.add(frame, art);
  }
  // Canapé (contre le mur du fond).
  const sofa = new THREE.Group();
  const sofaMat = toon(0xf0483e);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 1.4), sofaMat);
  seat.position.y = 0.55;
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 0.4), sofaMat);
  backrest.position.set(0, 1.2, -0.55);
  for (const x of [-2.3, 2.3]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 1.4), toon(0xc9302a));
    arm.position.set(x, 0.75, 0);
    sofa.add(arm);
  }
  for (const x of [-1.1, 1.1]) {
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(2, 0.22, 1.2), toon(0xff6a5e));
    cushion.position.set(x, 0.95, 0.05);
    sofa.add(cushion);
  }
  sofa.add(seat, backrest);
  sofa.position.set(2.6, 0, -6.8);
  g.add(sofa);
  // Buffet (contre le mur de gauche).
  const buffet = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 3.4), toon(0x8a5530));
  body.position.y = 0.8;
  for (const z of [-0.85, 0.85]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 1.5), toon(0xa86a3c));
    door.position.set(0.62, 0.8, z);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xffc83d));
    knob.position.set(0.68, 0.8, z * 0.25);
    buffet.add(door, knob);
  }
  buffet.add(body);
  buffet.position.set(-8.2, 0, -2.5);
  g.add(buffet);
  // Télé sur son meuble.
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 2.6), toon(0x3c3c46));
  stand.position.set(-8.3, 0.3, 3.2);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 2.2), toon(0x1e2a4a, { emissive: 0x16305a }));
  screen.position.set(-8.3, 1.3, 3.2);
  g.add(stand, screen);
  // Lampe et plante.
  const lampFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), toon(0x3c3c46));
  lampFoot.position.set(5.6, 1.3, -6.9);
  const shadeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 16, 1, true), toon(0xffe58a, { emissive: 0x806600 }));
  shadeMesh.position.set(5.6, 2.7, -6.9);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 14), toon(0xe07a3f));
  pot.position.set(-7.6, 0.35, -6.9);
  g.add(lampFoot, shadeMesh, pot);
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), toon(k % 2 ? 0x2f9a44 : 0x3fae49));
    const a = (k / 7) * Math.PI * 2;
    leaf.position.set(-7.6 + Math.cos(a) * 0.35, 1.1 + (k % 3) * 0.3, -6.9 + Math.sin(a) * 0.35);
    leaf.scale.set(0.8, 1.3, 0.8);
    g.add(leaf);
  }
  // Petit fauteuil à droite.
  const chair = new THREE.Group();
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), toon(0x9b5de5));
  chairSeat.position.y = 0.45;
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.3), toon(0x7d45c4));
  chairBack.position.set(0, 1, -0.6);
  chair.add(chairSeat, chairBack);
  chair.position.set(7.2, 0, -2.5);
  chair.rotation.y = -0.9;
  g.add(chair);
  const spots = [
    new THREE.Vector3(1.2, 1.1, -6.7), // derrière un coussin du canapé
    new THREE.Vector3(-7.4, 1.7, -2.5), // sur le buffet
    new THREE.Vector3(-7.4, 0.3, -0.6), // derrière le buffet
    new THREE.Vector3(-7.4, 0.9, 3.2), // sous la télé
    new THREE.Vector3(-6.9, 0.3, -6.3), // derrière la plante
    new THREE.Vector3(5.6, 0.2, -6.4), // au pied de la lampe
    new THREE.Vector3(7.0, 0.8, -2.2), // dans le fauteuil
    new THREE.Vector3(3.9, 1.1, -6.6), // au bout du canapé
  ];
  return { group: g, spots };
}

/** Un téléphone posé à plat (écran allumé ou non). */
export function phone3D(screenColor: THREE.ColorRepresentation = 0x3d8bff): { group: THREE.Group; screen: THREE.Mesh } {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.8), toon(0x1e2230));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.7), toon(screenColor, { emissive: screenColor }));
  screen.position.y = 0.04;
  group.add(body, screen);
  return { group, screen };
}

/** Table basse ronde, au centre du tapis. */
export function coffeeTable(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.16, 40), toon(0xa86a3c));
  top.position.y = 0.75;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 0.7, 16), toon(0x8a5530));
  foot.position.y = 0.35;
  g.add(top, foot);
  return g;
}
