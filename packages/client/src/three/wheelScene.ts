/**
 * La Grande Roue en 3D : une roue de jeu télévisé debout sur une scène, avec ses picots et son clapet,
 * la banque en pile de médailles, et les joueurs alignés devant (celui dont c'est le tour s'avance).
 */
import { PLAYER_COLORS, type PublicPlayer, type WheelState } from "@rzparty/shared";
import { Character3D, Stage3D, THREE, label, shade, textTexture, toon } from "./kit3d.ts";

const R = 3.2;
const CENTER = new THREE.Vector3(0, R + 0.9, 0);
const SPIN_MS = 3400;

/** Point du bord à un angle compté depuis le haut, dans le sens des aiguilles d'une montre. */
function rim(theta: number, r: number): THREE.Vector2 {
  return new THREE.Vector2(Math.sin(theta) * r, Math.cos(theta) * r);
}

export class WheelScene {
  private readonly stage: Stage3D;
  private readonly rotor = new THREE.Group();
  private readonly flap: THREE.Group;
  private readonly potGroup = new THREE.Group();
  private readonly chars = new Map<string, Character3D>();
  private readonly tags = new Map<string, { sprite: THREE.Sprite; text: string }>();
  private builtPhase = -1;
  private segments = 0;
  /** Angle affiché (degrés, sens horaire) et lancer en cours. */
  private angle = 0;
  private spin: { from: number; to: number; start: number; instant: boolean } | null = null;
  private shownSpin = -1;
  private potShown = -1;
  private potLabel: THREE.Sprite | null = null;
  private lastPeg = 0;
  private flapKick = 0;
  private turnId: string | null = null;
  private medals: Record<string, number> = {};

  constructor(host: HTMLElement, private readonly wide: boolean) {
    this.stage = new Stage3D(host, { fov: 38 });
    const scene = this.stage.scene;

    // La scène : plancher, estrade, rideaux et projecteurs.
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.4, 64), toon(0x8a5cc9));
    floor.position.y = -0.2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.12, 8, 64), toon(0xffc83d));
    ring.rotation.x = Math.PI / 2;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 12, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8), toon(0xb3261e));
    (back.material as THREE.Material).side = THREE.BackSide;
    back.position.set(0, 6, 1);
    scene.add(floor, ring, back);
    for (let k = -5; k <= 5; k++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(0xfff3b0, { emissive: 0xc9a200 }));
      bulb.position.set(k * 0.85, 0.08, 8.9 - Math.abs(k) * 0.1);
      scene.add(bulb);
    }

    // Le pied de la roue.
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, CENTER.y, 16), toon(0x3c3c46));
    stand.position.set(0, CENTER.y / 2, -0.4);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.3, 32), toon(0x3c3c46));
    base.position.set(0, 0.15, -0.4);
    scene.add(stand, base);

    this.rotor.position.copy(CENTER);
    scene.add(this.rotor);

    // Le clapet en haut : il bat quand un picot passe.
    this.flap = new THREE.Group();
    const flapMesh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 3), toon(0x1e2a4a));
    flapMesh.rotation.z = Math.PI;
    flapMesh.position.y = -0.3;
    const flapHinge = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), toon(0xffc83d));
    this.flap.add(flapMesh, flapHinge);
    this.flap.position.set(0, CENTER.y + R + 0.35, 0.3);
    scene.add(this.flap);

    // La banque.
    this.potGroup.position.set(-5.2, 0, 1.2);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.9, 24), toon(0xffe58a));
    table.position.y = 0.45;
    this.potGroup.add(table);
    scene.add(this.potGroup);

    this.stage.onTick((now) => this.tick(now));
    this.frame(true);
  }

  private frame(instant = false): void {
    const portrait = this.stage.aspect < 1;
    const d = portrait ? 19 : this.wide ? 15 : 16;
    this.stage.look(new THREE.Vector3(0, 4.2 + (portrait ? 1.5 : 0), d), new THREE.Vector3(0, portrait ? 3.8 : 3.5, 0), instant);
  }

  private buildWheel(w: WheelState): void {
    for (const c of [...this.rotor.children]) {
      this.rotor.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of [o.material].flat()) (m as THREE.MeshBasicMaterial).map?.dispose(), m.dispose();
        }
      });
    }
    const n = w.segments.length;
    this.segments = n;
    const step = (Math.PI * 2) / n;
    w.segments.forEach((seg, i) => {
      const a0 = i * step;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      for (let k = 0; k <= 12; k++) {
        const p = rim(a0 + (step * k) / 12, R);
        shape.lineTo(p.x, p.y);
      }
      shape.lineTo(0, 0);
      const wedge = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), toon(seg.color));
      wedge.position.z = -0.15;
      this.rotor.add(wedge);
      // Le libellé, dans l'axe de la part, jamais à l'envers.
      const mid = a0 + step / 2;
      const dir = rim(mid, 1);
      const len = Math.min(R * 0.62, 2.4);
      const tex = textTexture(seg.label, { color: "#fff", outline: "#1e2a4acc", width: 512, height: 128, size: 92 });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, len / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      const at = rim(mid, R * 0.6);
      plane.position.set(at.x, at.y, 0.17);
      plane.rotation.z = Math.atan2(dir.y, dir.x) + (dir.x < -0.01 ? Math.PI : 0);
      if (n > 14) plane.scale.setScalar(0.8);
      this.rotor.add(plane);
      // Les picots.
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), toon(0xffffff));
      const pp = rim(a0, R - 0.05);
      peg.position.set(pp.x, pp.y, 0.25);
      peg.rotation.x = Math.PI / 2;
      this.rotor.add(peg);
    });
    // Le bord doré et le moyeu.
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 10, 96), toon(0xf2b705));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 32), toon(0xffffff));
    hub.rotation.x = Math.PI / 2;
    const hubTop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), toon(0xffc83d));
    hubTop.position.z = 0.3;
    this.rotor.add(edge, hub, hubTop);
  }

  update(w: WheelState, players: PublicPlayer[]): void {
    if (w.phase !== this.builtPhase) {
      this.builtPhase = w.phase;
      this.buildWheel(w);
    }
    const t = w.turn;
    if (t && t.segment !== null && t.spinId !== this.shownSpin) {
      const first = this.shownSpin === -1;
      this.shownSpin = t.spinId;
      const step = 360 / w.segments.length;
      const target = -(t.segment + 0.5) * step;
      const current = ((this.angle % 360) + 360) % 360;
      let delta = (((target - current) % 360) + 360) % 360;
      delta += 360 * 5;
      const instant = first || t.phase !== "spinning";
      this.spin = { from: this.angle, to: this.angle + delta, start: performance.now(), instant };
    }
    this.turnId = t?.playerId ?? null;
    this.updatePlayers(w, players);
    // Ceux qui gagnent des médailles sautent de joie (une fois la roue arrêtée).
    for (const [id, m] of Object.entries(w.medals)) {
      if (this.medals[id] !== undefined && m > this.medals[id]! && !this.spin) this.chars.get(id)?.cheer();
    }
    if (!this.spin) this.medals = { ...w.medals };
    this.updatePot(w.pot);
  }

  private updatePlayers(w: WheelState, players: PublicPlayer[]): void {
    const ids = w.order.filter((id) => players.some((p) => p.id === id));
    for (const [id, c] of this.chars) {
      if (!ids.includes(id)) {
        this.stage.scene.remove(c.group);
        c.dispose();
        this.chars.delete(id);
        const tag = this.tags.get(id);
        if (tag) this.stage.scene.remove(tag.sprite), this.tags.delete(id);
      }
    }
    const gap = Math.min(1.9, 9 / Math.max(1, ids.length));
    ids.forEach((id, i) => {
      const p = players.find((x) => x.id === id)!;
      let c = this.chars.get(id);
      if (c && !c.same(p.avatar, p.isBot)) {
        this.stage.scene.remove(c.group);
        c.dispose();
        c = undefined;
      }
      const isTurn = id === this.turnId;
      const at = new THREE.Vector3((i - (ids.length - 1) / 2) * gap + 1, 0, isTurn ? 4.6 : 3.4);
      if (!c) {
        c = new Character3D(p.avatar, { bot: p.isBot, scale: 1, ring: PLAYER_COLORS[p.color]?.hex ?? 0xffffff });
        c.place(at);
        this.chars.set(id, c);
        this.stage.scene.add(c.group);
      } else c.goTo(at);
      c.face(new THREE.Vector3(at.x * 0.3, 0, 20));
      // Médailles au-dessus de la tête.
      const text = `🏅 ${w.medals[id] ?? 0}`;
      let tag = this.tags.get(id);
      if (!tag || tag.text !== text) {
        if (tag) this.stage.scene.remove(tag.sprite), tag.sprite.material.map?.dispose(), tag.sprite.material.dispose();
        const sprite = label(text, { scale: 0.42, width: 320, height: 96, color: "#fff" });
        tag = { sprite, text };
        this.tags.set(id, tag);
        this.stage.scene.add(sprite);
      }
    });
  }

  private updatePot(pot: number): void {
    if (pot === this.potShown) return;
    const grew = pot > this.potShown && this.potShown >= 0;
    this.potShown = pot;
    for (const c of [...this.potGroup.children].slice(1)) {
      this.potGroup.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
      if (c instanceof THREE.Sprite) c.material.map?.dispose(), c.material.dispose();
    }
    // Une pièce par tranche de 50 médailles (jusqu'à 40), en petites piles.
    const coins = Math.min(40, Math.max(pot > 0 ? 1 : 0, Math.round(pot / 50)));
    const coinMat = toon(0xffc83d);
    const edgeMat = toon(shade(0xd99a0b, -0.1));
    for (let k = 0; k < coins; k++) {
      const pile = k % 4;
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 20), [edgeMat, coinMat, coinMat]);
      const a = (pile / 4) * Math.PI * 2 + 0.6;
      coin.position.set(Math.cos(a) * 0.42, 0.95 + Math.floor(k / 4) * 0.105, Math.sin(a) * 0.42);
      coin.rotation.y = k;
      this.potGroup.add(coin);
    }
    this.potLabel = label(`Banque : 🏅 ${pot}`, { scale: 0.55, width: 512, height: 96, color: grew ? "#fff3b0" : "#fff" });
    this.potLabel.position.set(0, 2.3 + Math.ceil(coins / 4) * 0.105, 0);
    this.potGroup.add(this.potLabel);
  }

  private tick(now: number): void {
    // La roue tourne (ralentit en douceur), le clapet bat à chaque picot.
    if (this.spin) {
      const s = this.spin;
      const t = s.instant ? 1 : Math.min(1, (now - s.start) / SPIN_MS);
      // Comme la courbe CSS d'avant : départ vif, longue fin en douceur.
      const ease = 1 - Math.pow(1 - t, 3.2);
      this.angle = s.from + (s.to - s.from) * ease;
      if (t >= 1) this.spin = null;
    }
    this.rotor.rotation.z = (-this.angle * Math.PI) / 180;
    if (this.segments) {
      const peg = Math.floor((this.angle / 360) * this.segments);
      if (peg !== this.lastPeg) {
        this.lastPeg = peg;
        this.flapKick = 1;
      }
    }
    this.flapKick = Math.max(0, this.flapKick - 0.12);
    this.flap.rotation.z = -this.flapKick * 0.5;
    for (const [id, c] of this.chars) {
      c.tick(now);
      const tag = this.tags.get(id);
      if (tag) tag.sprite.position.copy(c.group.position).setY(c.group.position.y + 1.75);
    }
    this.frame();
  }

  /** Fait sauter de joie un joueur (gain). */
  cheer(id: string): void {
    this.chars.get(id)?.cheer();
  }

  destroy(): void {
    for (const c of this.chars.values()) c.dispose();
    this.stage.dispose();
  }
}
