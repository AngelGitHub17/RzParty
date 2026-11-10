/**
 * Test d'amitié en 3D : une scène avec un tapis par réponse. Pendant la question, les joueurs attendent
 * au fond (une bulle ✔ quand ils ont répondu) ; à la révélation, chacun rejoint le tapis de sa réponse,
 * et les tapis où l'on est plusieurs s'illuminent de cœurs.
 */
import { PLAYER_COLORS, type AmitieState, type PublicPlayer } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label, studio, toon } from "./kit3d.ts";

const OPTION_COLORS = [0xf45fae, 0x2f7bef, 0x2db866, 0xf2b705, 0x9257e8, 0xff8a1f, 0x18bdbd, 0xf0483e];

export class AmitieScene {
  private readonly stage: Stage3D;
  private readonly pads = new THREE.Group();
  private readonly bubbles = new THREE.Group();
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private padsKey = "";
  private padPos: THREE.Vector3[] = [];
  private revealKey = "";
  private finalShown = false;
  private heartsAt = 0;
  private phase: AmitieState["phase"] = "answer";

  constructor(host: HTMLElement, private readonly wide: boolean) {
    this.stage = new Stage3D(host, { fov: 40 });
    const scene = this.stage.scene;
    scene.add(studio(0xb98be0, 8.5, 0xffffff), this.pads, this.bubbles, this.fx.group, this.texts.group);
    // Arche de cœurs au fond.
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (k / 8);
      const heart = label("❤", { scale: 0.7, width: 128, height: 128, color: "#ff5c8a", outline: undefined });
      heart.position.set(Math.cos(a) * 5, 0.6 + Math.sin(a) * 3.6, -5);
      heart.userData.float = k;
      scene.add(heart);
    }
    this.cast = new Cast(scene, { scale: 0.8, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(0, 4.2, portrait ? 13 : wide ? 8 : 9), new THREE.Vector3(0, 1.1, -0.2), true);
  }

  private buildPads(a: AmitieState, players: PublicPlayer[]): void {
    const key = `${a.round}:${a.options.join("|")}`;
    if (key === this.padsKey) return;
    this.padsKey = key;
    for (const c of [...this.pads.children]) this.pads.remove(c);
    const n = a.options.length;
    const width = Math.min(8.5, n * 2.6);
    this.padPos = a.options.map((_, i) => new THREE.Vector3(n === 1 ? 0 : -width / 2 + (width * i) / (n - 1), 0, 1.4));
    a.options.forEach((opt, i) => {
      const target = a.kind === "qui" ? players.find((p) => p.id === opt) : undefined;
      const color = target ? (PLAYER_COLORS[target.color]?.hex ?? OPTION_COLORS[i]!) : OPTION_COLORS[i % OPTION_COLORS.length]!;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(n > 2 ? 0.9 : 1.4, n > 2 ? 1 : 1.5, 0.25, 36), toon(color));
      pad.position.copy(this.padPos[i]!).setY(0.12);
      pad.userData.option = i;
      const text = label(target ? target.name : opt, { scale: n > 2 ? 0.42 : 0.55, width: 640, height: 128, color: "#ffffff" });
      text.position.copy(this.padPos[i]!).setY(n > 2 ? 2.6 : 2.8);
      this.pads.add(pad, text);
    });
  }

  update(a: AmitieState, players: PublicPlayer[]): void {
    this.phase = a.phase;
    this.buildPads(a, players);
    const ids = players.map((p) => p.id);
    // Où chacun se tient : au fond pendant la question, sur son tapis à la révélation.
    const waiting = (i: number) => new THREE.Vector3((i - (ids.length - 1) / 2) * 1.3, 0, -2.4);
    const counts = new Map<number, number>();
    this.cast.sync(players, ids, (id, i) => {
      if (a.phase === "reveal" && a.answers && a.answers[id] !== undefined) {
        const opt = a.answers[id]!;
        const k = counts.get(opt) ?? 0;
        counts.set(opt, k + 1);
        const p = this.padPos[opt] ?? new THREE.Vector3();
        const ang = k * 2.4;
        return p.clone().add(new THREE.Vector3(Math.cos(ang) * 0.55 * Math.min(1, k), 0.25, Math.sin(ang) * 0.45 * Math.min(1, k)));
      }
      if (a.phase === "final") return new THREE.Vector3((i - (ids.length - 1) / 2) * 1.3, 0, 1.4);
      return waiting(i);
    });
    this.cast.each((c) => c.face(new THREE.Vector3(c.group.position.x * 0.5, 0, 12)));
    // Bulles « ✔ » au-dessus de ceux qui ont répondu (les réponses restent secrètes).
    const bubbleKey = a.phase === "answer" ? `${a.round}:${a.answered.join(",")}` : "";
    if (bubbleKey !== this.bubbleKey) this.rebuildBubbles(a, bubbleKey);
    this.afterBubbles(a, players);
  }

  private bubbleKey = "-";

  private rebuildBubbles(a: AmitieState, key: string): void {
    this.bubbleKey = key;
    for (const b of [...this.bubbles.children] as THREE.Sprite[]) {
      this.bubbles.remove(b);
      b.material.map?.dispose();
      b.material.dispose();
    }
    if (a.phase === "answer") {
      for (const id of a.answered) {
        const c = this.cast.get(id);
        if (!c) continue;
        const b = label("✔", { scale: 0.45, width: 128, height: 128, color: "#8ff0a4" });
        b.userData.follow = c;
        this.bubbles.add(b);
      }
    }
  }

  private afterBubbles(a: AmitieState, _players: PublicPlayer[]): void {
    // Révélation : cœurs sur les tapis où plusieurs ont répondu pareil.
    const key = a.phase === "reveal" ? `${a.round}` : "";
    if (key && key !== this.revealKey && a.answers) {
      this.revealKey = key;
      const byOpt = new Map<number, string[]>();
      for (const [id, opt] of Object.entries(a.answers)) byOpt.set(opt, [...(byOpt.get(opt) ?? []), id]);
      setTimeout(() => {
        for (const [opt, list] of byOpt) {
          if (list.length < 2) continue;
          const at = (this.padPos[opt] ?? new THREE.Vector3()).clone().setY(1.8);
          this.fx.burst(at, { count: 30, colors: [0xff5c8a, 0xffffff, 0xf45fae], speed: 2.5, life: 1400, size: 0.24 });
          this.texts.add(`❤ ×${list.length}`, at.clone().setY(2.2), "#ffb3cb", 0.9);
          for (const id of list) this.cast.get(id)?.cheer(1500);
        }
      }, 900);
    }
    if (a.phase === "final" && !this.finalShown) {
      this.finalShown = true;
      this.cast.each((c) => c.cheer(5000));
    }
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    for (const b of this.bubbles.children) {
      const c = b.userData.follow as { group: THREE.Group } | undefined;
      if (c) b.position.copy(c.group.position).setY(c.group.position.y + 1.9 + Math.sin(now / 300) * 0.05);
    }
    this.stage.scene.traverse((o) => {
      if (o.userData.float !== undefined) o.position.y += Math.sin(now / 500 + (o.userData.float as number)) * 0.004;
    });
    // Fin de partie : pluie de cœurs.
    if (this.phase === "final" && now - this.heartsAt > 350) {
      this.heartsAt = now;
      this.fx.burst(new THREE.Vector3((Math.random() - 0.5) * 8, 5, (Math.random() - 0.5) * 3), { count: 3, colors: [0xff5c8a, 0xf45fae], speed: 0.5, up: -0.5, gravity: 1.5, life: 2600, size: 0.28 });
    }
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
