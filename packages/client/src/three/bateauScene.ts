/**
 * Le Bateau d'équilibre en 3D : un voilier sur la mer, son mât et ses 3 vergues, les personnages posés
 * dessus (plus gros = plus lourd). Le bateau penche pour de vrai ; on pose son personnage en touchant une place.
 */
import { BOAT_LEVER, BOAT_LIMIT, BOAT_PLACES, boatFreeSlots, boatTorque, normalizeAvatar, type BateauState } from "@rzparty/shared";
import { Character3D, Stage3D, THREE, sea, toon } from "./kit3d.ts";

const YARD_COLORS = [0x2db866, 0xf7c21b, 0x9257e8];
const YARD_Y = [5.4, 4.0, 2.6];
const SPACING = 0.62;

function slotPos(yard: number, slot: number): THREE.Vector3 {
  return new THREE.Vector3(slot * SPACING * BOAT_LEVER[yard]!, YARD_Y[yard]! + 0.12, 0);
}

export class BateauScene {
  private readonly stage: Stage3D;
  private readonly boat = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly targets = new THREE.Group();
  private readonly sailors = new Map<string, Character3D>();
  private tilt = 0;
  private goalTilt = 0;
  private phase: BateauState["phase"] = "place";
  private sinkT = 0;
  private targetsKey = "";
  private waves: { tick: (now: number) => void };

  constructor(host: HTMLElement, private readonly onPlace: (slot: number) => void) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    const water = sea(70, 0x4fb3ec);
    this.waves = water;
    scene.add(water.mesh);
    // Îlots au loin.
    for (const [x, z, s] of [[-14, -16, 2.4], [16, -20, 3], [24, -8, 1.6]] as const) {
      const isle = new THREE.Mesh(new THREE.SphereGeometry(s, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x7bcb3a));
      isle.position.set(x, -0.2, z);
      isle.scale.y = 0.45;
      scene.add(isle);
    }

    // La coque.
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-4.2, 0.9);
    hullShape.quadraticCurveTo(-3.6, -0.6, -1.8, -0.8);
    hullShape.lineTo(1.8, -0.8);
    hullShape.quadraticCurveTo(3.8, -0.6, 4.6, 1.1);
    hullShape.lineTo(-4.2, 0.9);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 2.2, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }), toon(0xb5653a));
    hull.position.z = -1.1;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.18, 2.5), toon(0xffffff));
    stripe.position.y = 0.55;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.12, 2.2), toon(0xe2b07a));
    deck.position.y = 0.9;
    this.boat.add(hull, stripe, deck);
    // Hublots.
    for (let k = -2; k <= 2; k++) {
      const port = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), toon(0x1e2a4a));
      port.position.set(k * 1.2, 0.2, 1.23);
      this.boat.add(port);
    }

    // Le mât et les vergues.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 6.4, 12), toon(0x8a5a32));
    mast.position.y = 3.9;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3), toon(0xf0483e));
    flag.rotation.z = -Math.PI / 2;
    flag.position.set(0.45, 7.0, 0);
    this.rig.add(mast, flag);
    YARD_Y.forEach((y, yard) => {
      const half = 5.4 * SPACING * BOAT_LEVER[yard]!;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, half * 2, 10), toon(YARD_COLORS[yard]!));
      bar.rotation.z = Math.PI / 2;
      bar.position.y = y;
      this.rig.add(bar);
      // Petites marques à chaque place.
      for (const slot of BOAT_PLACES) {
        const mark = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 12), toon(0xffffff));
        mark.position.copy(slotPos(yard, slot)).setY(y);
        mark.rotation.y = Math.PI / 2;
        this.rig.add(mark);
      }
      // Une voile sous la vergue du haut.
      if (yard < 2) {
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(half * 1.6, YARD_Y[yard]! - YARD_Y[yard + 1]! - 0.35), toon(0xfffaf0));
        (sail.material as THREE.Material).side = THREE.DoubleSide;
        sail.position.set(0, y - (YARD_Y[yard]! - YARD_Y[yard + 1]!) / 2, -0.25);
        this.rig.add(sail);
      }
    });
    this.rig.add(this.targets);
    this.boat.add(this.rig);
    scene.add(this.boat);

    this.stage.onTick((now, dt) => this.tick(now, dt));
    this.frame(true);
  }

  private frame(instant = false): void {
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, 4.6, portrait ? 21 : 14.5), new THREE.Vector3(0, portrait ? 3.0 : 3.4, 0), instant);
  }

  update(b: BateauState, mine: boolean): void {
    this.goalTilt = Math.max(-1.3, Math.min(1.3, b.tilt / BOAT_LIMIT));
    if (b.phase !== this.phase && b.phase === "place") this.sinkT = 0;
    if (b.phase === "won" && this.phase !== "won") for (const c of this.sailors.values()) c.cheer(3000);
    this.phase = b.phase;

    // Les personnages à bord.
    const keys = new Set<string>();
    for (const s of b.sailors) {
      const key = `${s.yard}:${s.slot}`;
      keys.add(key);
      const avatar = normalizeAvatar(s.avatar);
      let c = this.sailors.get(key);
      if (c && !c.same(avatar, false)) {
        this.rig.remove(c.group);
        c.dispose();
        c = undefined;
      }
      if (!c) {
        c = new Character3D(avatar, { scale: 0.38 + s.size * 0.15 });
        c.place(slotPos(s.yard, s.slot).add(new THREE.Vector3(0, 1.4, 0)));
        c.goTo(slotPos(s.yard, s.slot));
        this.sailors.set(key, c);
        this.rig.add(c.group);
      }
    }
    for (const [key, c] of this.sailors) {
      if (!keys.has(key)) {
        this.rig.remove(c.group);
        c.dispose();
        this.sailors.delete(key);
      }
    }

    // Les places possibles pour le personnage à poser.
    const current = b.queue[0];
    const free = mine && current && b.phase === "place" ? boatFreeSlots(b.sailors, current.sailor.yard) : [];
    const key = `${current?.sailor.yard}:${free.join(",")}:${b.tilt}`;
    if (key !== this.targetsKey) {
      this.targetsKey = key;
      this.stage.clearPicks();
      for (const t of [...this.targets.children]) {
        this.targets.remove(t);
        (t as THREE.Mesh).geometry.dispose();
      }
      for (const slot of free) {
        const risky = Math.abs(boatTorque({ ...current!.sailor, slot }) + b.tilt) > BOAT_LIMIT;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), toon(risky ? 0xf0483e : 0xffc83d, { transparent: true, opacity: 0.85 }));
        ball.position.copy(slotPos(current!.sailor.yard, slot)).setY(YARD_Y[current!.sailor.yard]! + 0.32);
        ball.userData.base = ball.position.y;
        // Zone de toucher plus large que la boule (doigts au téléphone).
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        ball.add(hit);
        this.targets.add(ball);
        this.stage.pick(ball, () => this.onPlace(slot));
      }
    }
  }

  private tick(now: number, dt: number): void {
    this.waves.tick(now);
    this.tilt += (this.goalTilt - this.tilt) * Math.min(1, dt * 3);
    const bob = Math.sin(now / 900) * 0.06;
    if (this.phase === "sunk") this.sinkT = Math.min(1, this.sinkT + dt * 0.5);
    const lean = this.phase === "sunk" ? Math.sign(this.tilt || 1) * (0.3 + this.sinkT * 1.1) : this.tilt * 0.28;
    // Penché vers la droite = rotation horaire (z négatif).
    this.boat.rotation.z = -lean + Math.sin(now / 1300) * 0.015;
    this.boat.position.y = bob - this.sinkT * 1.6;
    for (const c of this.sailors.values()) c.tick(now);
    for (const t of this.targets.children) t.position.y = (t.userData.base as number) + Math.sin(now / 220) * 0.06;
    this.frame();
  }

  destroy(): void {
    for (const c of this.sailors.values()) c.dispose();
    this.stage.dispose();
  }
}
