/**
 * Trios en 3D : une table ronde avec les personnages du centre, et autour, l'estrade de chaque joueur
 * avec ses 6 personnages en 2 rangées. On touche un personnage du centre, puis celui à remplacer chez soi.
 */
import { PLAYER_COLORS, TRIO_JOKER, normalizeAvatar, trioRows, type PublicPlayer, type TrioChar, type TriosState } from "@rzparty/shared";
import { Cast, Character3D, FloatTexts, Particles, Stage3D, THREE, label, studio, toon } from "./kit3d.ts";

const TABLE_R = 2;
const RING_R = 6.2;

interface Seat {
  stage: THREE.Group;
  chars: (Character3D | null)[];
  keys: string[];
}

export class TriosScene {
  private readonly stage: Stage3D;
  private readonly centerGroup = new THREE.Group();
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private centerChars: (Character3D | null)[] = [];
  private centerKeys: string[] = [];
  private seats = new Map<string, Seat>();
  private marks: THREE.Object3D[] = [];
  private lastSwapKey = "";
  private scoredKey = "";
  private selectedMark: THREE.Mesh;

  constructor(
    host: HTMLElement,
    private readonly layout: "tv" | "pad" | "solo",
    private readonly meId: string | null,
    private readonly handlers: { onCenter: (i: number) => void; onSlot: (slot: number) => void },
  ) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    scene.add(studio(0x2f7bef, 9.5));
    const table = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R + 0.1, 0.5, 48), toon(0xffe58a));
    table.position.y = 0.25;
    const top = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.08, 8, 48), toon(0xffffff));
    top.rotation.x = Math.PI / 2;
    top.position.y = 0.5;
    this.selectedMark = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 28), toon(0xffc83d, { emissive: 0x7a5200 }));
    this.selectedMark.rotation.x = Math.PI / 2;
    this.selectedMark.visible = false;
    scene.add(table, top, this.centerGroup, this.selectedMark, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.75, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    this.frame(true);
  }

  private frame(instant = false): void {
    const portrait = this.stage.aspect < 1;
    // Sur sa manette, on regarde la table depuis sa propre estrade (placée devant).
    if (this.layout !== "tv" && this.meId) this.stage.look(new THREE.Vector3(0, portrait ? 10.5 : 8, portrait ? 11.5 : 10.5), new THREE.Vector3(0, 0, portrait ? 2 : 2.4), instant);
    else this.stage.look(new THREE.Vector3(0, portrait ? 17 : 12, portrait ? 13 : 9.5), new THREE.Vector3(0, 0, 0.6), instant);
  }

  /** Angle de l'estrade d'un joueur : moi devant, les autres répartis autour. */
  private seatAngle(order: string[], id: string): number {
    const mine = this.layout !== "tv" && this.meId && order.includes(this.meId) ? this.meId : null;
    const list = mine ? [mine, ...order.filter((x) => x !== mine)] : order;
    const i = list.indexOf(id);
    const n = list.length;
    // Réparties sur 300° à partir de l'avant (+Z).
    return n <= 1 ? 0 : (i / n) * Math.PI * 2;
  }

  private charFor(c: TrioChar, scale: number): Character3D {
    const char = new Character3D(normalizeAvatar(c.avatar), { scale });
    // Couleur encore cachée : un « ? » au-dessus ; joker : un anneau arc-en-ciel.
    if (c.color === null) {
      const q = label("?", { scale: 0.5, width: 128, height: 128, color: "#ffffff" });
      q.position.y = 1.55 * scale + 0.3;
      char.group.add(q);
    } else if (c.color === TRIO_JOKER) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 * scale + 0.1, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.6 * scale;
      ring.userData.rainbow = true;
      char.group.add(ring);
    }
    return char;
  }

  update(t: TriosState, players: PublicPlayer[], selected: number | null, myTurn: boolean): void {
    // Les joueurs, chacun derrière son estrade.
    const ids = t.order.filter((id) => players.some((p) => p.id === id) && t.platforms[id]);
    this.cast.sync(players, ids, (id) => {
      const a = this.seatAngle(ids, id);
      return new THREE.Vector3(Math.sin(a) * (RING_R + 1.6), 0, Math.cos(a) * (RING_R + 1.6));
    });
    this.cast.each((c, id) => {
      c.face(new THREE.Vector3(0, 0, 0));
      if (id === t.turn && !c.moving) c.group.position.y = 0.15;
      else c.group.position.y = 0;
    });
    this.stage.clearPicks();
    this.updateCenter(t, selected, myTurn);
    for (const id of ids) this.updateSeat(t, id, players, selected !== null && myTurn && id === this.meId);
    for (const [id, seat] of this.seats) {
      if (ids.includes(id)) continue;
      this.stage.scene.remove(seat.stage);
      for (const c of seat.chars) c?.dispose();
      this.seats.delete(id);
    }
    // Échange qui vient d'avoir lieu : petit saut et étincelles.
    const swapKey = t.lastSwap ? `${t.lastSwap.playerId}:${t.lastSwap.slot}:${t.lastSwap.center}:${t.round}` : "";
    if (swapKey && swapKey !== this.lastSwapKey) {
      this.lastSwapKey = swapKey;
      const c = this.seats.get(t.lastSwap!.playerId)?.chars[t.lastSwap!.slot];
      if (c) {
        c.cheer(900);
        this.fx.burst(c.group.getWorldPosition(new THREE.Vector3()).setY(1.2), { count: 14, colors: [0xffe58a, 0xffffff], speed: 2, life: 700 });
      }
    }
    // Trios marqués : confettis au-dessus de la rangée.
    const scoredKey = t.phase === "score" ? `${t.round}:${t.scored.map((s) => s.playerId).join()}` : "";
    if (scoredKey && scoredKey !== this.scoredKey) {
      this.scoredKey = scoredKey;
      for (const s of t.scored) {
        const seat = this.seats.get(s.playerId);
        if (!seat) continue;
        const at = seat.stage.getWorldPosition(new THREE.Vector3()).setY(1.6);
        this.fx.burst(at, { count: 36, colors: [0xf0483e, 0x2f7bef, 0xffc83d, 0x2db866], speed: 3.5, life: 1600, size: 0.2 });
        this.texts.add(`+${s.points}`, at.clone().setY(2.4), "#8ff0a4", 1);
        for (const c of seat.chars) c?.cheer(1500);
      }
    }
  }

  private updateCenter(t: TriosState, selected: number | null, myTurn: boolean): void {
    const n = t.center.length;
    t.center.forEach((c, i) => {
      const key = c ? `${JSON.stringify(c.avatar)}:${c.color}` : "";
      if (this.centerKeys[i] !== key) {
        const old = this.centerChars[i];
        if (old) {
          this.centerGroup.remove(old.group);
          old.dispose();
        }
        this.centerKeys[i] = key;
        this.centerChars[i] = c ? this.charFor(c, 0.62) : null;
        if (this.centerChars[i]) this.centerGroup.add(this.centerChars[i]!.group);
      }
      const char = this.centerChars[i];
      if (!char) return;
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI / Math.max(1, n);
      char.place(new THREE.Vector3(Math.sin(a) * (TABLE_R - 0.6), 0.5, Math.cos(a) * (TABLE_R - 0.6)));
      char.face(new THREE.Vector3(Math.sin(a) * 9, 0, Math.cos(a) * 9));
      if (myTurn) this.pickable(char, () => this.handlers.onCenter(i));
    });
    for (let i = n; i < this.centerChars.length; i++) {
      const old = this.centerChars[i];
      if (old) {
        this.centerGroup.remove(old.group);
        old.dispose();
      }
    }
    this.centerChars.length = n;
    this.centerKeys.length = n;
    const sel = selected !== null ? this.centerChars[selected] : null;
    this.selectedMark.visible = Boolean(sel);
    if (sel) this.selectedMark.position.copy(sel.group.position).setY(0.56);
  }

  /** Rend un personnage facile à toucher : un cylindre invisible plus large que lui. */
  private pickable(char: Character3D, handler: () => void): void {
    let hit = char.group.userData.hit as THREE.Mesh | undefined;
    if (!hit) {
      hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.y = 0.6;
      char.group.add(hit);
      char.group.userData.hit = hit;
    }
    this.stage.pick(char.group, handler);
  }

  private updateSeat(t: TriosState, id: string, players: PublicPlayer[], placing: boolean): void {
    const p = players.find((x) => x.id === id)!;
    let seat = this.seats.get(id);
    if (!seat) {
      const group = new THREE.Group();
      const color = PLAYER_COLORS[p.color]?.hex ?? 0xffffff;
      const board = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 1.9), toon(color));
      board.position.y = 0.15;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.1, 2), toon(0xffffff));
      edge.position.y = 0.02;
      group.add(board, edge);
      this.stage.scene.add(group);
      seat = { stage: group, chars: [], keys: [] };
      this.seats.set(id, seat);
    }
    const a = this.seatAngle(t.order.filter((x) => t.platforms[x]), id);
    seat.stage.position.set(Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R);
    seat.stage.rotation.y = a;
    const chars = t.platforms[id]!;
    const rows = trioRows(chars.map((c) => c.color));
    chars.forEach((c, slot) => {
      const key = `${JSON.stringify(c.avatar)}:${c.color}`;
      if (seat!.keys[slot] !== key) {
        const old = seat!.chars[slot];
        if (old) {
          seat!.stage.remove(old.group);
          old.dispose();
        }
        seat!.keys[slot] = key;
        const char = this.charFor(c, 0.5);
        seat!.chars[slot] = char;
        seat!.stage.add(char.group);
        // Rangée du fond (0-2) derrière, rangée de devant (3-5) côté table.
        const row = Math.floor(slot / 3);
        char.place(new THREE.Vector3(((slot % 3) - 1) * 0.9, 0.3, row === 0 ? 0.45 : -0.45));
      }
      const char = seat!.chars[slot]!;
      char.face(new THREE.Vector3(char.group.position.x, 0, 5));
      char.group.scale.setScalar(rows.includes(Math.floor(slot / 3)) ? 1.12 : 1);
      if (placing) this.pickable(char, () => this.handlers.onSlot(slot));
    });
  }

  private tick(now: number, dt: number): void {
    const hue = (now / 1500) % 1;
    for (const c of [...this.centerChars, ...[...this.seats.values()].flatMap((s) => s.chars)]) {
      if (!c) continue;
      c.tick(now);
      c.group.traverse((o) => {
        if (o.userData.rainbow) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHSL(hue, 0.9, 0.6);
      });
    }
    this.selectedMark.rotation.z = now / 300;
    this.selectedMark.position.y = 0.56 + Math.sin(now / 200) * 0.03;
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    for (const m of this.marks) m.rotation.y = now / 1000;
    this.frame();
  }

  destroy(): void {
    for (const c of this.centerChars) c?.dispose();
    for (const s of this.seats.values()) for (const c of s.chars) c?.dispose();
    this.cast.dispose();
    this.stage.dispose();
  }
}
