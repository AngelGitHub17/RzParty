/**
 * Tic-tac-boum en 3D : les joueurs en cercle sur le tapis du salon, la bombe (avec ses fils de couleur)
 * qui saute de l'un à l'autre, sa mèche qui crépite de plus en plus vite, la consigne au-dessus du porteur,
 * les ratés (la bombe tremble) et le BOUM.
 */
import { PLAYER_COLORS, WIRE_COLORS, type PublicPlayer, type TictacState } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, toon } from "./kit3d.ts";
import { salonDecor } from "./salonDecor.ts";

const RING = 3.3;
const TASK_ICON: Record<string, string> = { fil: "✂️", symbole: "★", compte: "👆", maintiens: "✋", ordre: "123" };

export class TictacScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly bomb = new THREE.Group();
  private readonly bombBody: THREE.Mesh;
  private readonly spark: THREE.Mesh;
  private icon: THREE.Sprite | null = null;
  private iconKey = "";
  private holder: string | null = null;
  private from = new THREE.Vector3();
  private passAt = 0;
  private slipAt = 0;
  private seenSlip = 0;
  private heat = 0;
  private boomKey = "";
  private sparkAt = 0;
  private phase: TictacState["phase"] = "play";

  constructor(host: HTMLElement, private readonly compact: boolean) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    scene.add(salonDecor({ rug: 0xffc83d }).group);
    // La bombe : boule noire, fils de couleur enroulés, cadran rouge, mèche et étincelle.
    this.bombBody = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), toon(0x1e2230));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12), toon(0x5c6370));
    cap.position.y = 0.44;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), toon(0xd8c39a));
    fuse.position.set(0.05, 0.62, 0);
    fuse.rotation.z = -0.3;
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(0xffc83d, { emissive: 0xff8a1f }));
    this.spark.position.set(0.1, 0.78, 0);
    WIRE_COLORS.slice(0, 4).forEach((w, i) => {
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.025, 6, 32, Math.PI * 0.9), toon(w.hex));
      wire.rotation.set(Math.PI / 2 + (i - 1.5) * 0.25, 0, i * 0.8);
      this.bomb.add(wire);
    });
    const dial = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), toon(0xf0483e, { emissive: 0x7a1000 }));
    dial.position.set(0, 0.05, 0.42);
    this.bomb.add(this.bombBody, cap, fuse, this.spark, dial);
    scene.add(this.bomb, this.fx.group, this.texts.group);
    this.cast = new Cast(scene, { scale: 0.9, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, portrait ? 9 : compact ? 5 : 4.6, portrait ? 10 : compact ? 8 : 7.4), new THREE.Vector3(0, 1.2, 0), true);
  }

  update(t: TictacState, players: PublicPlayer[]): void {
    this.phase = t.phase;
    this.heat = t.heat;
    const ids = t.order.filter((id) => players.some((p) => p.id === id));
    this.cast.sync(players, ids, (_, i) => {
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2;
      return new THREE.Vector3(Math.sin(a) * RING, 0, Math.cos(a) * RING);
    });
    this.cast.each((c) => c.face(new THREE.Vector3(0, 0, 0)));
    if (t.holder !== this.holder) {
      this.from.copy(this.bomb.position);
      this.passAt = performance.now();
      this.holder = t.holder;
    }
    // Icône de la consigne au-dessus du porteur.
    const iconKey = t.phase === "play" && t.task ? `${t.taskId}` : "";
    if (iconKey !== this.iconKey) {
      this.iconKey = iconKey;
      if (this.icon) {
        this.stage.scene.remove(this.icon);
        this.icon.material.map?.dispose();
        this.icon.material.dispose();
        this.icon = null;
      }
      if (t.task) {
        this.icon = label(TASK_ICON[t.task.kind] ?? "?", { scale: 0.55, width: 192, height: 128, bg: "#ffffffee", color: "#1e2a4a", outline: "#ffffff" });
        this.stage.scene.add(this.icon);
      }
    }
    // Raté : la bombe tremble et la mèche crache.
    if (t.slip && t.slip.at !== this.seenSlip) {
      this.seenSlip = t.slip.at;
      this.slipAt = performance.now();
      this.texts.add("−4 s", this.bomb.position.clone().add(new THREE.Vector3(0, 0.8, 0)), "#ff6a5e", 0.55);
    }
    const boomKey = t.phase === "boom" && t.blast ? `${t.blast.playerId}:${t.blast.at}` : "";
    if (boomKey && boomKey !== this.boomKey) {
      this.boomKey = boomKey;
      const c = this.cast.get(t.blast!.playerId);
      const at = (c?.group.position ?? new THREE.Vector3()).clone().setY(1.6);
      this.fx.burst(at, { count: 70, colors: [0xff6a1f, 0xffc83d, 0xd63a00, 0x3c3c46], speed: 5, up: 1.2, gravity: 4, life: 1400, size: 0.4 });
      this.fx.burst(at, { count: 24, colors: [0x5c6370, 0x8f8a80], speed: 1.2, up: 1.5, gravity: -0.5, life: 2200, size: 0.8 });
      this.texts.add("BOUM !", at.clone().setY(2.8), "#ff8a1f", 1.1);
      c?.cheer(1200);
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    const c = this.holder ? this.cast.get(this.holder) : undefined;
    this.bomb.visible = Boolean(c) && this.phase === "play";
    if (c) {
      const target = c.group.position.clone().setY(c.group.position.y + 2);
      const t = Math.min(1, (now - this.passAt) / 450);
      this.bomb.position.lerpVectors(this.from, target, t);
      this.bomb.position.y += Math.sin(t * Math.PI) * 1.4;
      // Tremblement après un raté.
      const shake = Math.max(0, 1 - (now - this.slipAt) / 500);
      this.bomb.position.x += Math.sin(now / 18) * 0.12 * shake;
      this.bomb.rotation.y += dt * (1 + this.heat);
      if (this.icon) {
        this.icon.visible = this.bomb.visible;
        this.icon.position.copy(this.bomb.position).add(new THREE.Vector3(0, 1.05, 0));
      }
    } else if (this.icon) this.icon.visible = false;
    // Plus elle chauffe, plus elle gonfle et rougit.
    const beat = Math.sin(now / (this.heat === 2 ? 70 : this.heat === 1 ? 140 : 260));
    this.bombBody.scale.setScalar(1 + beat * (0.03 + this.heat * 0.04));
    (this.bombBody.material as THREE.MeshToonMaterial).emissive.setHex(this.heat === 2 && beat > 0 ? 0x7a1000 : this.heat === 1 && beat > 0.5 ? 0x3a0800 : 0x000000);
    this.spark.scale.setScalar(0.8 + Math.random() * 0.6);
    if (this.bomb.visible && now - this.sparkAt > (this.heat === 2 ? 40 : this.heat === 1 ? 90 : 160)) {
      this.sparkAt = now;
      this.fx.burst(this.spark.getWorldPosition(new THREE.Vector3()), { count: 2, colors: [0xffc83d, 0xffffff], speed: 1.2, up: 1, gravity: 3, life: 400, size: 0.1 });
    }
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
