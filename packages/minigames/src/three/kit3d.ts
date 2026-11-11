/**
 * Boîte à outils 3D commune aux modes de jeu : une scène Three.js prête à l'emploi (lumières,
 * caméra qui glisse en douceur, redimensionnement, boucle d'animation), des matériaux « dessin animé »,
 * des textes, des dés, des personnages qui sautent et des objets cliquables.
 * Chaque mode garde ses commandes en HTML par-dessus la scène (lisibles et faciles au téléphone).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Avatar } from "@rzparty/shared";
import { buildAvatar3D, disposeObject } from "./avatar3d.ts";

export { THREE, disposeObject };

let gradientMap: THREE.DataTexture | null = null;
/** Matériau « dessin animé » (3 paliers de lumière). */
export function toon(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  const m = new THREE.MeshToonMaterial({ color, gradientMap });
  if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
  if (opts.transparent) (m.transparent = true), (m.opacity = opts.opacity ?? 0.6);
  return m;
}

/** Couleur éclaircie (amount > 0) ou assombrie (amount < 0). */
export function shade(hex: THREE.ColorRepresentation, amount: number): THREE.Color {
  const c = new THREE.Color(hex);
  return amount < 0 ? c.lerp(new THREE.Color(0x1e2a4a), -amount) : c.lerp(new THREE.Color(0xffffff), amount);
}

/** WebGL disponible ? (sinon les vues restent en 2D) */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Texture d'un texte (emoji compris), contouré pour rester lisible sur tous les fonds. */
export function textTexture(text: string, opts: { color?: string; outline?: string; size?: number; width?: number; height?: number; bg?: string; weight?: number } = {}): THREE.CanvasTexture {
  const width = opts.width ?? 256;
  const height = opts.height ?? 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.roundRect(4, 4, width - 8, height - 8, Math.min(width, height) * 0.2);
    ctx.fill();
  }
  let size = opts.size ?? Math.round(height * 0.62);
  ctx.font = `${opts.weight ?? 700} ${size}px 'Fredoka Variable', 'Fredoka', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
  // Rétrécit le texte s'il dépasse.
  while (ctx.measureText(text).width > width * 0.9 && size > 10) {
    size -= 4;
    ctx.font = `${opts.weight ?? 700} ${size}px 'Fredoka Variable', 'Fredoka', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (opts.outline) {
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeStyle = opts.outline;
    ctx.strokeText(text, width / 2, height / 2 + size * 0.05);
  }
  ctx.fillStyle = opts.color ?? "#ffffff";
  ctx.fillText(text, width / 2, height / 2 + size * 0.05);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Étiquette toujours tournée vers la caméra. */
export function label(text: string, opts: Parameters<typeof textTexture>[1] & { scale?: number } = {}): THREE.Sprite {
  const w = opts.width ?? 256;
  const h = opts.height ?? 128;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(text, { outline: "#1e2a4a", ...opts, width: w, height: h }), depthWrite: false, transparent: true }));
  const s = opts.scale ?? 1;
  sprite.scale.set(s * (w / h), s, 1);
  return sprite;
}

/** Disque horizontal portant un texte ou un symbole (dessus d'une case…). */
export function textDisc(text: string, radius: number, opts: Parameters<typeof textTexture>[1] = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ map: textTexture(text, opts), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ───────────── Dés ─────────────

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};
export type DieLook = "blanc" | "or" | "argent" | "bronze";
const DIE_COLORS: Record<DieLook, [string, string, string]> = {
  blanc: ["#ffffff", "#ffffff", "#1e2a4a"],
  or: ["#ffe58a", "#d99a0b", "#5a3a00"],
  argent: ["#ffffff", "#a9b1bd", "#2b313b"],
  bronze: ["#f2b98a", "#a8612d", "#3b1d07"],
};

function dieFace(value: number, look: DieLook): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const [a, b, ink] = DIE_COLORS[look];
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, a);
  grad.addColorStop(0.55, b);
  grad.addColorStop(1, a);
  ctx.fillStyle = look === "blanc" ? a : grad;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = ink;
  for (const [x, y] of PIPS[Math.max(1, Math.min(6, value))]!) {
    ctx.beginPath();
    ctx.arc(x * 128, y * 128, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Orientation qui montre la face « valeur » vers le haut (faces : +x=1, -x=6, +y=2, -y=5, +z=3, -z=4). */
const UP_FACE: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, Math.PI / 2),
  6: new THREE.Euler(0, 0, -Math.PI / 2),
  2: new THREE.Euler(0, 0, 0),
  5: new THREE.Euler(Math.PI, 0, 0),
  3: new THREE.Euler(-Math.PI / 2, 0, 0),
  4: new THREE.Euler(Math.PI / 2, 0, 0),
};

/**
 * Un dé qui roule : `roll(value)` le fait tourner puis se poser sur la valeur.
 * Les dés bonus à moins de 6 faces répètent leurs valeurs sur les faces restantes.
 */
/** Normale (dans le repère du dé) de la face qui porte chaque valeur. */
const FACE_NORMAL: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(1, 0, 0),
  6: new THREE.Vector3(-1, 0, 0),
  2: new THREE.Vector3(0, 1, 0),
  5: new THREE.Vector3(0, -1, 0),
  3: new THREE.Vector3(0, 0, 1),
  4: new THREE.Vector3(0, 0, -1),
};

export class Die3D {
  readonly mesh: THREE.Mesh;
  private rolling: { start: number; value: number; from: THREE.Quaternion; spin: THREE.Vector3 } | null = null;
  /** Si renseignée, la valeur obtenue se tourne vers cette caméra (sinon elle regarde vers le ciel). */
  viewer: THREE.Camera | null = null;
  private value: number | null = null;
  constructor(look: DieLook = "blanc", size = 0.6) {
    const faces = [1, 6, 2, 5, 3, 4];
    this.mesh = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 4, size * 0.16), faces.map((v) => new THREE.MeshToonMaterial({ map: dieFace(v, look) })));
  }
  roll(value: number): void {
    this.rolling = { start: performance.now(), value, from: this.mesh.quaternion.clone(), spin: new THREE.Vector3(Math.random() * 14 + 8, Math.random() * 10 + 6, Math.random() * 12 + 6) };
  }
  /** Montre une valeur sans animation. */
  show(value: number): void {
    this.rolling = null;
    this.value = value;
    this.mesh.quaternion.copy(this.restFor(value));
  }
  /** Orientation finale : la face `value` vers la caméra (ou vers le haut sans caméra). */
  private restFor(value: number): THREE.Quaternion {
    const normal = FACE_NORMAL[value] ?? FACE_NORMAL[1]!;
    if (!this.viewer) return new THREE.Quaternion().setFromEuler(UP_FACE[value] ?? UP_FACE[1]!);
    // Direction de la caméra, ramenée dans le repère du parent du dé.
    const at = this.mesh.getWorldPosition(new THREE.Vector3());
    const dir = this.viewer.getWorldPosition(new THREE.Vector3()).sub(at).normalize();
    const parentQ = this.mesh.parent ? this.mesh.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    dir.applyQuaternion(parentQ.invert());
    const q = new THREE.Quaternion().setFromUnitVectors(normal, dir);
    // On redresse le dé autour de cet axe pour que ses arêtes restent à peu près verticales.
    const up = new THREE.Vector3(0, 1, 0);
    const side = normal.y !== 0 ? new THREE.Vector3(0, 0, normal.y > 0 ? -1 : 1) : up.clone();
    const sideNow = side.applyQuaternion(q);
    const want = up.clone().sub(dir.clone().multiplyScalar(up.dot(dir))).normalize();
    const have = sideNow.sub(dir.clone().multiplyScalar(sideNow.dot(dir))).normalize();
    if (want.lengthSq() > 0.5 && have.lengthSq() > 0.5) {
      const angle = Math.atan2(have.clone().cross(want).dot(dir), have.dot(want));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, angle));
    }
    return q;
  }
  tick(now: number): void {
    const r = this.rolling;
    if (!r) {
      // Le dé posé continue de regarder la caméra (le joueur bouge, la caméra aussi).
      if (this.viewer && this.value !== null) this.mesh.quaternion.slerp(this.restFor(this.value), 0.15);
      return;
    }
    this.value = r.value;
    const t = Math.min(1, (now - r.start) / 900);
    const end = this.restFor(r.value);
    if (t < 0.7) {
      const e = new THREE.Euler(r.spin.x * t, r.spin.y * t, r.spin.z * t);
      this.mesh.quaternion.copy(r.from).multiply(new THREE.Quaternion().setFromEuler(e));
      this.mesh.position.y = Math.sin(t * Math.PI) * 0.5;
    } else {
      this.mesh.quaternion.slerp(end, Math.min(1, (t - 0.7) / 0.3 + 0.2));
      this.mesh.position.y = Math.max(0, Math.sin(t * Math.PI) * 0.5);
    }
    if (t >= 1) {
      this.mesh.quaternion.copy(end);
      this.mesh.position.y = 0;
      this.rolling = null;
    }
  }
  dispose(): void {
    disposeObject(this.mesh);
  }
}

// ───────────── Personnages ─────────────

/**
 * Un personnage 3D (avatar) qui se déplace en sautillant vers sa cible, et peut faire la fête.
 * Créé à partir de l'avatar : recréé seulement si l'avatar change.
 */
export class Character3D {
  readonly group = new THREE.Group();
  private model: THREE.Group;
  private key: string;
  private queue: THREE.Vector3[] = [];
  private hop: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null;
  private cheerUntil = 0;
  private ring: THREE.Mesh | null = null;
  hopMs = 260;
  /** Appelé à chaque atterrissage (poussière, son…). */
  onLand: ((at: THREE.Vector3) => void) | null = null;
  private squash = 0;
  constructor(avatar: Avatar, opts: { bot?: boolean; scale?: number; ring?: THREE.ColorRepresentation } = {}) {
    this.key = JSON.stringify(avatar) + Boolean(opts.bot);
    this.model = buildAvatar3D(avatar, { bot: opts.bot });
    this.model.scale.setScalar(opts.scale ?? 1);
    this.group.add(this.model);
    if (opts.ring !== undefined) {
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 * (opts.scale ?? 1), 0.05, 8, 24), toon(opts.ring));
      this.ring.rotation.x = Math.PI / 2;
      this.ring.position.y = 0.03;
      this.group.add(this.ring);
    }
  }
  same(avatar: Avatar, bot: boolean): boolean {
    return this.key === JSON.stringify(avatar) + bot;
  }
  /** Place sans animation. */
  place(at: THREE.Vector3): void {
    this.queue = [];
    this.hop = null;
    this.group.position.copy(at);
  }
  /** Va jusqu'à `at` en sautillant (en passant par les points donnés). */
  goTo(at: THREE.Vector3, via: THREE.Vector3[] = []): void {
    const last = this.queue.at(-1) ?? this.hop?.to ?? this.group.position;
    if (last.distanceTo(at) < 0.01) return;
    // Nouvelle destination : on repart de là où l'on est (sans finir l'ancien trajet).
    this.queue = [...via.map((v) => v.clone()), at.clone()].slice(-24);
  }
  /** Où il va (ou est). */
  get destination(): THREE.Vector3 {
    return this.queue.at(-1) ?? this.hop?.to ?? this.group.position;
  }
  /** Regarde vers un point (rotation autour de l'axe vertical). */
  face(point: THREE.Vector3): void {
    const dx = point.x - this.group.position.x;
    const dz = point.z - this.group.position.z;
    if (Math.hypot(dx, dz) > 0.01) this.model.rotation.y = Math.atan2(dx, dz);
  }
  cheer(ms = 1400): void {
    this.cheerUntil = performance.now() + ms;
  }
  get moving(): boolean {
    return Boolean(this.hop || this.queue.length);
  }
  tick(now: number): void {
    if (!this.hop && this.queue.length) {
      const to = this.queue.shift()!;
      this.hop = { from: this.group.position.clone(), to, start: now };
      this.face(to);
    }
    if (this.hop) {
      const dist = this.hop.from.distanceTo(this.hop.to);
      const dur = Math.max(this.hopMs, Math.min(900, dist * 140));
      const t = Math.min(1, (now - this.hop.start) / dur);
      this.group.position.lerpVectors(this.hop.from, this.hop.to, t);
      this.group.position.y = this.hop.from.y + (this.hop.to.y - this.hop.from.y) * t + Math.sin(t * Math.PI) * Math.min(1.2, 0.35 + dist * 0.08);
      if (t >= 1) {
        const at = this.hop.to.clone();
        this.hop = null;
        this.squash = now;
        this.onLand?.(at);
      }
    }
    // Petite respiration, ou saut de joie.
    const cheering = now < this.cheerUntil;
    this.model.position.y = cheering ? Math.abs(Math.sin(now / 130)) * 0.35 : Math.sin(now / 420 + this.group.id) * 0.015;
    // Petit écrasement en touchant le sol.
    const sq = Math.max(0, 1 - (now - this.squash) / 180);
    const base = this.model.userData.baseScale ?? (this.model.userData.baseScale = this.model.scale.x);
    this.model.scale.set(base * (1 + sq * 0.12), base * (1 - sq * 0.16), base * (1 + sq * 0.12));
    if (this.ring) this.ring.visible = !cheering;
  }
  dispose(): void {
    disposeObject(this.group);
  }
}

// ───────────── La scène ─────────────

export interface Stage3DOptions {
  fov?: number;
  /** Toucher au premier contact (« pointerdown ») plutôt qu'au relâché : pour les jeux de rapidité. */
  pickOnPress?: boolean;
  /** Couleur de fond (sinon transparent : le fond CSS se voit). */
  background?: THREE.ColorRepresentation;
  /** Brouillard léger vers cette couleur. */
  fog?: THREE.ColorRepresentation;
}

/**
 * Une scène 3D posée dans un élément HTML. `onTick` est appelé à chaque image ;
 * `pick` rend des objets cliquables (souris, doigt).
 */
export class Stage3D {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private camPos = new THREE.Vector3(0, 8, 10);
  private camLook = new THREE.Vector3();
  private goalPos = new THREE.Vector3(0, 8, 10);
  private goalLook = new THREE.Vector3();
  private ticks = new Set<(now: number, dt: number) => void>();
  private pickables = new Map<THREE.Object3D, () => void>();
  private hovered: THREE.Object3D | null = null;
  private ray = new THREE.Raycaster();
  private observer: ResizeObserver;
  private disposed = false;
  /** Vitesse de la caméra (0 à 1 par image ≈ 60 i/s). */
  camSpeed = 0.06;

  constructor(private readonly host: HTMLElement, opts: Stage3DOptions = {}) {
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 40, 1, 0.1, 400);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: opts.background === undefined });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (opts.background !== undefined) this.scene.background = new THREE.Color(opts.background);
    if (opts.fog !== undefined) this.scene.fog = new THREE.Fog(opts.fog, 30, 90);
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add("stage3d__canvas");
    host.classList.add("stage3d");
    host.prepend(this.canvas);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9fd3f5, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-6, 14, 9);
    this.scene.add(sun);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();

    this.canvas.addEventListener("pointermove", (e) => this.hover(e));
    this.canvas.addEventListener("pointerleave", () => this.setHover(null));
    this.canvas.addEventListener(opts.pickOnPress ? "pointerdown" : "click", (e) => {
      const hit = this.hit(e);
      if (hit) {
        if (opts.pickOnPress) e.preventDefault();
        this.pickables.get(hit)?.();
      }
    });

    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const fn of this.ticks) fn(now, dt);
      const k = 1 - Math.pow(1 - this.camSpeed, dt * 60);
      this.camPos.lerp(this.goalPos, k);
      this.camLook.lerp(this.goalLook, k);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Largeur / hauteur de l'affichage (pour adapter le cadrage au téléphone). */
  get aspect(): number {
    return this.camera.aspect;
  }

  /** Place la caméra (en glissant, ou d'un coup avec `instant`). */
  look(from: THREE.Vector3, at: THREE.Vector3, instant = false): void {
    this.goalPos.copy(from);
    this.goalLook.copy(at);
    if (instant) {
      this.camPos.copy(from);
      this.camLook.copy(at);
    }
  }

  onTick(fn: (now: number, dt: number) => void): () => void {
    this.ticks.add(fn);
    return () => this.ticks.delete(fn);
  }

  /** Rend un objet cliquable (ses enfants compris). `null` pour le retirer. */
  pick(obj: THREE.Object3D, handler: (() => void) | null): void {
    if (handler) this.pickables.set(obj, handler);
    else this.pickables.delete(obj);
  }

  clearPicks(): void {
    this.pickables.clear();
    this.setHover(null);
  }

  private hit(e: PointerEvent | MouseEvent): THREE.Object3D | null {
    if (!this.pickables.size) return null;
    const rect = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(p, this.camera);
    const hits = this.ray.intersectObjects([...this.pickables.keys()], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !this.pickables.has(o)) o = o.parent;
      if (o) return o;
    }
    return null;
  }

  private hover(e: PointerEvent): void {
    this.setHover(this.hit(e));
  }

  private setHover(obj: THREE.Object3D | null): void {
    if (this.hovered === obj) return;
    if (this.hovered) this.hovered.scale.multiplyScalar(1 / 1.12);
    this.hovered = obj;
    if (obj) obj.scale.multiplyScalar(1.12);
    this.canvas.style.cursor = obj ? "pointer" : "";
  }

  /** Position à l'écran (en pixels dans l'élément) d'un point 3D : pour placer des bulles HTML. */
  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight, visible: v.z < 1 };
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.canvas.remove();
  }
}

/** Mer animée (vagues douces) : un grand disque bleu qui ondule. */
export function sea(radius: number, color: THREE.ColorRepresentation = 0x7ccff5): { mesh: THREE.Mesh; tick: (now: number) => void } {
  const geo = new THREE.CircleGeometry(radius, 96, 0, Math.PI * 2);
  const mesh = new THREE.Mesh(geo, toon(color));
  mesh.rotation.x = -Math.PI / 2;
  const base = (geo.attributes.position!.array as Float32Array).slice();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  return {
    mesh,
    tick: (now) => {
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3]!;
        const y = base[i * 3 + 1]!;
        pos.setZ(i, Math.sin(x * 0.5 + now / 700) * 0.06 + Math.cos(y * 0.4 + now / 900) * 0.06);
      }
      pos.needsUpdate = true;
    },
  };
}

/** Arbre stylisé (tronc + boule de feuillage). */
export function tree(scale = 1, color: THREE.ColorRepresentation = 0x3fae49): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.45, 8), toon(0x9a6542));
  trunk.position.y = 0.22;
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), toon(color));
  crown.position.y = 0.7;
  g.add(trunk, crown);
  g.scale.setScalar(scale);
  return g;
}

// ───────────── Effets : particules et textes qui s'envolent ─────────────

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  born: number;
  life: number;
  gravity: number;
  spin: number;
  size: number;
}

let dotTexture: THREE.CanvasTexture | null = null;
function dot(): THREE.CanvasTexture {
  if (dotTexture) return dotTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

export interface BurstOptions {
  count?: number;
  colors?: THREE.ColorRepresentation[];
  speed?: number;
  /** Direction privilégiée (sinon dans tous les sens, vers le haut). */
  up?: number;
  gravity?: number;
  life?: number;
  size?: number;
  spread?: number;
}

/** Petites particules (poussière, étincelles, confettis, fumée, lave). */
export class Particles {
  readonly group = new THREE.Group();
  private items: Particle[] = [];

  burst(at: THREE.Vector3, o: BurstOptions = {}): void {
    const colors = o.colors ?? [0xffffff];
    const count = Math.min(o.count ?? 12, 160 - this.items.length);
    for (let k = 0; k < count; k++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color: colors[k % colors.length], transparent: true, depthWrite: false }));
      sprite.position.copy(at);
      const spread = o.spread ?? 1;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2 * spread, (o.up ?? 1) * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 2 * spread).multiplyScalar(o.speed ?? 2);
      const size = (o.size ?? 0.18) * (0.7 + Math.random() * 0.6);
      sprite.scale.setScalar(size);
      this.group.add(sprite);
      this.items.push({ sprite, vel, born: performance.now(), life: (o.life ?? 900) * (0.7 + Math.random() * 0.6), gravity: o.gravity ?? 4, spin: 0, size });
    }
  }

  tick(now: number, dt: number): void {
    this.items = this.items.filter((p) => {
      const t = (now - p.born) / p.life;
      if (t >= 1) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        return false;
      }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.material.opacity = 1 - t * t;
      p.sprite.scale.setScalar(p.size * (1 + t * 0.4));
      return true;
    });
  }
}

/** Texte qui s'envole et disparaît (« +4 », « −4 »…). */
export class FloatTexts {
  readonly group = new THREE.Group();
  private items: { sprite: THREE.Sprite; born: number; from: THREE.Vector3 }[] = [];

  add(text: string, at: THREE.Vector3, color = "#ffffff", scale = 0.7): void {
    const sprite = label(text, { scale, width: 320, height: 128, color });
    sprite.position.copy(at);
    this.group.add(sprite);
    this.items.push({ sprite, born: performance.now(), from: at.clone() });
  }

  tick(now: number): void {
    this.items = this.items.filter((it) => {
      const t = (now - it.born) / 1700;
      if (t >= 1) {
        this.group.remove(it.sprite);
        it.sprite.material.map?.dispose();
        it.sprite.material.dispose();
        return false;
      }
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15) * 0.4);
      it.sprite.position.copy(it.from).add(new THREE.Vector3(0, t * 1.4, 0));
      it.sprite.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      it.sprite.scale.set((it.sprite.userData.w ??= it.sprite.scale.x) * pop, (it.sprite.userData.h ??= it.sprite.scale.y) * pop, 1);
      return true;
    });
  }
}

/** Nuage stylisé (quelques boules blanches). */
export function cloud(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(0xffffff);
  for (const [x, y, r] of [[0, 0, 0.8], [0.8, -0.1, 0.6], [-0.8, -0.15, 0.55], [0.3, 0.35, 0.55]] as const) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
    b.position.set(x, y, 0);
    g.add(b);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Palmier (tronc courbé, palmes). */
export function palm(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = toon(0xa8774a);
  for (let k = 0; k < 5; k++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.07 - k * 0.006, 0.08 - k * 0.006, 0.32, 7), trunkMat);
    seg.position.set(k * k * 0.012, 0.16 + k * 0.3, 0);
    seg.rotation.z = -k * 0.05;
    g.add(seg);
  }
  const crown = new THREE.Group();
  crown.position.set(0.2, 1.55, 0);
  const leafMat = toon(0x2f9a44);
  for (let k = 0; k < 7; k++) {
    // Chaque palme part du sommet et retombe un peu.
    const pivot = new THREE.Group();
    pivot.rotation.y = (k / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.22), leafMat);
    leaf.position.x = 0.38;
    leaf.rotation.z = -0.45;
    leaf.position.y = -0.15;
    pivot.add(leaf);
    crown.add(pivot);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0x7a4a22));
  nut.position.y = -0.1;
  crown.add(nut);
  g.add(crown);
  g.userData.crown = crown;
  g.scale.setScalar(scale);
  return g;
}

// ───────────── Joueurs d'une scène ─────────────

export interface CastPlayer {
  id: string;
  avatar: Avatar;
  isBot: boolean;
  color: number;
}

/**
 * Les personnages des joueurs dans une scène : créés, mis à jour (avatar changé) et retirés au besoin.
 * `colorHex` donne la couleur de l'anneau de chaque joueur.
 */
export class Cast {
  private readonly chars = new Map<string, Character3D>();
  constructor(
    private readonly parent: THREE.Object3D,
    private readonly opts: { scale?: number; colorHex: (color: number) => THREE.ColorRepresentation; ring?: boolean } ,
  ) {}

  /** Met à jour la troupe ; renvoie les personnages dans l'ordre des identifiants donnés. */
  sync(players: CastPlayer[], ids: string[], place?: (id: string, index: number) => THREE.Vector3): Character3D[] {
    for (const [id, c] of this.chars) {
      if (!ids.includes(id)) {
        this.parent.remove(c.group);
        c.dispose();
        this.chars.delete(id);
      }
    }
    const out: Character3D[] = [];
    ids.forEach((id, i) => {
      const p = players.find((x) => x.id === id);
      if (!p) return;
      let c = this.chars.get(id);
      if (c && !c.same(p.avatar, p.isBot)) {
        this.parent.remove(c.group);
        c.dispose();
        c = undefined;
      }
      if (!c) {
        c = new Character3D(p.avatar, { bot: p.isBot, scale: this.opts.scale ?? 1, ring: this.opts.ring === false ? undefined : this.opts.colorHex(p.color) });
        if (place) c.place(place(id, i));
        this.chars.set(id, c);
        this.parent.add(c.group);
      } else if (place) c.goTo(place(id, i));
      out.push(c);
    });
    return out;
  }

  get(id: string): Character3D | undefined {
    return this.chars.get(id);
  }

  each(fn: (c: Character3D, id: string) => void): void {
    for (const [id, c] of this.chars) fn(c, id);
  }

  tick(now: number): void {
    for (const c of this.chars.values()) c.tick(now);
  }

  dispose(): void {
    for (const c of this.chars.values()) c.dispose();
    this.chars.clear();
  }
}

/** Plateau de studio : sol rond, liseré lumineux et petites ampoules. */
export function studio(color: THREE.ColorRepresentation, radius = 9, rim: THREE.ColorRepresentation = 0xffc83d): THREE.Group {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.4, 0.4, 64), toon(color));
  floor.position.y = -0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 8, 64), toon(rim, { emissive: rim }));
  ring.rotation.x = Math.PI / 2;
  g.add(floor, ring);
  const bulbMat = toon(0xfff3b0, { emissive: 0xc9a200 });
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bulbMat);
    bulb.position.set(Math.cos(a) * (radius - 0.25), 0.05, Math.sin(a) * (radius - 0.25));
    g.add(bulb);
  }
  return g;
}

/** Positions en arc de cercle (face à la caméra, vers +Z). */
export function arc(count: number, radius: number, spread = Math.PI * 0.8, center = new THREE.Vector3()): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const a = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
    return new THREE.Vector3(center.x + Math.sin(a) * radius, center.y, center.z + Math.cos(a) * radius);
  });
}
