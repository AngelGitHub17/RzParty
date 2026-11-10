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
export class Die3D {
  readonly mesh: THREE.Mesh;
  private rolling: { start: number; value: number; from: THREE.Quaternion; spin: THREE.Vector3 } | null = null;
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
    this.mesh.quaternion.setFromEuler(UP_FACE[value] ?? UP_FACE[1]!);
  }
  tick(now: number): void {
    const r = this.rolling;
    if (!r) return;
    const t = Math.min(1, (now - r.start) / 900);
    const end = new THREE.Quaternion().setFromEuler(UP_FACE[r.value] ?? UP_FACE[1]!);
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
      if (t >= 1) this.hop = null;
    }
    // Petite respiration, ou saut de joie.
    const cheering = now < this.cheerUntil;
    this.model.position.y = cheering ? Math.abs(Math.sin(now / 130)) * 0.35 : Math.sin(now / 420 + this.group.id) * 0.015;
    if (this.ring) this.ring.visible = !cheering;
  }
  dispose(): void {
    disposeObject(this.group);
  }
}

// ───────────── La scène ─────────────

export interface Stage3DOptions {
  fov?: number;
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
    this.canvas.addEventListener("click", (e) => {
      const hit = this.hit(e);
      if (hit) this.pickables.get(hit)?.();
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
