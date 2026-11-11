/**
 * Cache-cache en 3D : le salon et ses cachettes. Pendant la cachette, les chercheurs se tournent vers
 * le mur (« 🙈 ») et le cacheur file d'un meuble à l'autre ; pendant la recherche, tout le monde fouille,
 * les téléphones cachés sonnent (🔔) et réapparaissent une fois trouvés, avec un ✔.
 */
import { cacheRingOffset, CACHE_TIMINGS, PLAYER_COLORS, type CacheState, type PublicPlayer } from "@rzparty/shared";
import { Cast, FloatTexts, Particles, Stage3D, THREE, label } from "./kit3d.ts";
import { coffeeTable, phone3D, salonDecor } from "./salonDecor.ts";
import { hashId } from "../game/salonKit.ts";
import { serverNow } from "../game/clock.ts";

interface Phone {
  group: THREE.Group;
  check: THREE.Sprite | null;
  spot: THREE.Vector3;
}

export class CacheScene {
  private readonly stage: Stage3D;
  private readonly cast: Cast;
  private readonly fx = new Particles();
  private readonly texts = new FloatTexts();
  private readonly spots: THREE.Vector3[];
  private readonly phones = new Map<string, Phone>();
  private state: CacheState | null = null;
  private wanderAt = 0;
  private lastRing = new Map<string, number>();
  private phaseKey = "";

  constructor(host: HTMLElement, compact: boolean) {
    this.stage = new Stage3D(host, { fov: 42 });
    const decor = salonDecor({ rug: 0x9b5de5 });
    this.spots = decor.spots;
    this.stage.scene.add(decor.group, coffeeTable(), this.fx.group, this.texts.group);
    this.cast = new Cast(this.stage.scene, { scale: 0.85, colorHex: (c) => PLAYER_COLORS[c]?.hex ?? 0xffffff });
    this.stage.onTick((now, dt) => this.tick(now, dt));
    const portrait = this.stage.aspect < 1;
    this.stage.look(new THREE.Vector3(1.2, portrait ? 11 : compact ? 7 : 6.4, portrait ? 12 : compact ? 9 : 8.2), new THREE.Vector3(-0.8, 0.8, -2.6), true);
  }

  update(c: CacheState, players: PublicPlayer[]): void {
    const prev = this.state;
    this.state = c;
    const ids = Object.keys(c.scores).filter((id) => players.some((p) => p.id === id));
    const phaseKey = `${c.round}:${c.phase}`;
    const newPhase = phaseKey !== this.phaseKey;
    this.phaseKey = phaseKey;
    // Placement de départ de chaque phase.
    // Les personnages ne reprennent leur place qu'au changement de phase (sinon ils fouillent librement).
    this.cast.sync(players, ids, newPhase ? (id, i) => this.home(c, id, i, ids.length) : undefined);
    if (newPhase) {
      this.wanderAt = performance.now() + 900;
      if (c.phase === "intro") {
        const hider = c.hider ? this.cast.get(c.hider) : undefined;
        if (hider) this.texts.add("C'est moi qui cache !", hider.group.position.clone().setY(2.6), "#ffe58a", 0.6);
      }
      if (c.phase === "reveal" && c.last) {
        const winners = c.last.seekersWin ? ids.filter((id) => id !== c.last!.hider) : [c.last.hider];
        for (const id of winners) this.cast.get(id)?.cheer(4000);
        this.fx.burst(new THREE.Vector3(0, 3, 0), { count: 60, colors: [0xffc83d, 0xf45fae, 0x3d8bff, 0x3dbe5b], speed: 4, up: 1.2, gravity: 3, life: 1600, size: 0.3 });
      }
    }
    this.cast.each((ch, id) => {
      // Chercheurs tournés vers le mur pendant la cachette.
      if (c.phase === "hide" && id !== c.hider) ch.face(ch.group.position.clone().add(new THREE.Vector3(0, 0, -5)));
    });
    // Téléphones : sur la table au début, à leur cachette ensuite.
    for (const [id, p] of this.phones) {
      if (!c.devices.includes(id)) {
        this.stage.scene.remove(p.group);
        this.phones.delete(id);
      }
    }
    c.devices.forEach((id, i) => {
      let p = this.phones.get(id);
      if (!p) {
        const owner = players.find((x) => x.id === id);
        const { group } = phone3D(PLAYER_COLORS[owner?.color ?? 0]?.hex ?? 0x3d8bff);
        p = { group, check: null, spot: this.spots[(hashId(id) + i) % this.spots.length]!.clone() };
        this.phones.set(id, p);
        this.stage.scene.add(group);
      }
      const onTable = c.phase === "intro" || c.phase === "wait" || (c.phase === "hide" && !c.hidden.includes(id));
      const found = Boolean(c.found[id]);
      const a = (i / Math.max(1, c.devices.length)) * Math.PI * 2;
      p.group.position.copy(onTable ? new THREE.Vector3(Math.sin(a) * 1, 0.86, Math.cos(a) * 1) : p.spot);
      p.group.visible = onTable || found || c.phase === "reveal";
      // Trouvé : un ✔ et le chercheur qui court le chercher.
      if (found && !p.check) {
        p.check = label("✔", { scale: 0.6, width: 128, height: 128, color: "#3dbe5b", outline: "#ffffff" });
        p.check.position.copy(p.spot).add(new THREE.Vector3(0, 0.8, 0));
        this.stage.scene.add(p.check);
        const finder = this.cast.get(c.found[id]!);
        finder?.goTo(p.spot.clone().setY(0).add(new THREE.Vector3(0.6, 0, 0.6)));
        setTimeout(() => finder?.cheer(1200), 700);
        if (prev && !prev.found[id]) this.fx.burst(p.spot.clone().setY(1), { count: 24, colors: [0x3dbe5b, 0xffffff, 0xffc83d], speed: 2.5, up: 1.4, gravity: 3, life: 1000, size: 0.2 });
      }
      if (!found && p.check) {
        this.stage.scene.remove(p.check);
        p.check.material.map?.dispose();
        p.check.material.dispose();
        p.check = null;
      }
    });
  }

  /** Où se tient un joueur au début de chaque phase. */
  private home(c: CacheState, id: string, i: number, n: number): THREE.Vector3 {
    if (c.phase === "hide" && id !== c.hider) return new THREE.Vector3(-3 + i * 1.3, 0, -6.2);
    const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
    return new THREE.Vector3(Math.sin(a) * 3.2, 0, Math.cos(a) * 3.2);
  }

  private tick(now: number, dt: number): void {
    this.cast.tick(now);
    this.fx.tick(now, dt);
    this.texts.tick(now);
    const c = this.state;
    if (!c) return;
    // Le cacheur file de meuble en meuble ; pendant la recherche, les chercheurs fouillent partout.
    if (now - this.wanderAt > 1700) {
      this.wanderAt = now;
      this.cast.each((ch, id) => {
        const busy = (c.phase === "hide" && id === c.hider) || (c.phase === "seek" && id !== c.hider);
        if (!busy || Math.random() < 0.3) return;
        const spot = this.spots[Math.floor(Math.random() * this.spots.length)]!;
        ch.goTo(spot.clone().setY(0).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, 1 + Math.random() * 0.6)));
      });
    }
    // Les téléphones cachés sonnent au même rythme que les vrais.
    if (c.phase === "seek" && c.seekAt !== null) {
      c.devices.forEach((id, i) => {
        if (c.found[id]) return;
        const k = Math.floor((serverNow() - c.seekAt! - cacheRingOffset(i, c.devices.length) - 1500) / CACHE_TIMINGS.ring);
        if (k >= 0 && k !== this.lastRing.get(id)) {
          this.lastRing.set(id, k);
          const p = this.phones.get(id);
          if (p) this.texts.add("🔔", p.spot.clone().add(new THREE.Vector3(0, 0.6, 0)), "#ffe58a", 0.6);
        }
      });
    }
  }

  destroy(): void {
    this.cast.dispose();
    this.stage.dispose();
  }
}
