import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AVATAR_COLORS, type Avatar } from "@rzparty/shared";

/**
 * Avatar RzParty en 3D, construit uniquement avec des formes simples (sphères, capsules…) :
 * léger, sans fichier à charger, et réutilisable tel quel sur le plateau (phase 3).
 * Le pion mesure environ 1,2 unité de haut, posé sur y = 0, le visage tourné vers +Z.
 */

const INK = 0x1e2a4a;
let gradient: THREE.DataTexture | null = null;

/** Dégradé en 3 paliers : donne l'aspect « dessin animé » (toon shading). */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const toon = (color: THREE.ColorRepresentation) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
const flat = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color });

/** Contour sombre façon dessin : une copie un peu plus grosse, vue de l'intérieur. */
function outlined(mesh: THREE.Mesh, thickness = 0.022): THREE.Group {
  const group = new THREE.Group();
  // Le groupe prend la place du maillage : contour et maillage restent superposés.
  group.position.copy(mesh.position);
  group.rotation.copy(mesh.rotation);
  group.scale.copy(mesh.scale);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  const outline = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  mesh.geometry.computeBoundingBox();
  // Épaisseur constante à l'écran, quelle que soit l'échelle de l'objet.
  const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(group.scale);
  outline.scale.set(1 + (thickness / Math.max(size.x, 0.01)) * 2, 1 + (thickness / Math.max(size.y, 0.01)) * 2, 1 + (thickness / Math.max(size.z, 0.01)) * 2);
  group.add(mesh, outline);
  return group;
}

function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

interface Head {
  /** Centre de la tête. */
  y: number;
  r: number;
  /** Profondeur du visage (z de la surface) à une position (x, y) relative au centre. */
  surface(x: number, y: number): number;
  neck: number;
  top: number;
}

function buildBodyAndHead(avatar: Avatar, bodyColor: THREE.Color): { group: THREE.Group; head: Head } {
  const group = new THREE.Group();
  const mat = toon(bodyColor);
  const sphereHead = (y: number, r: number): Head => ({
    y,
    r,
    surface: (x, dy) => Math.sqrt(Math.max(0, r * r - x * x - dy * dy)),
    neck: y - r * 0.9,
    top: y + r,
  });

  switch (avatar.shape) {
    case "grand": {
      group.add(outlined(place(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.3, 8, 24), mat), 0, 0.36, 0)));
      group.add(outlined(place(new THREE.Mesh(new THREE.SphereGeometry(0.23, 32, 24), mat), 0, 0.86, 0)));
      return { group, head: sphereHead(0.86, 0.23) };
    }
    case "carre": {
      group.add(outlined(place(new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.44, 0.42, 4, 0.1), mat), 0, 0.24, 0)));
      group.add(outlined(place(new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.5, 0.48, 4, 0.14), mat), 0, 0.74, 0)));
      return { group, head: { y: 0.74, r: 0.27, surface: () => 0.24, neck: 0.48, top: 0.99 } };
    }
    case "poire": {
      const profile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.28, 0.02),
        new THREE.Vector2(0.34, 0.14),
        new THREE.Vector2(0.3, 0.32),
        new THREE.Vector2(0.18, 0.5),
        new THREE.Vector2(0.12, 0.6),
        new THREE.Vector2(0.0, 0.62),
      ];
      group.add(outlined(new THREE.Mesh(new THREE.LatheGeometry(profile, 32), mat)));
      group.add(outlined(place(new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), mat), 0, 0.8, 0)));
      return { group, head: sphereHead(0.8, 0.22) };
    }
    default: {
      group.add(outlined(place(new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.14, 8, 24), mat), 0, 0.32, 0)));
      group.add(outlined(place(new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 24), mat), 0, 0.8, 0)));
      return { group, head: sphereHead(0.8, 0.28) };
    }
  }
}

/** Petit morceau d'arc (sourcils, yeux fermés, bouche). */
function arc(radius: number, tube: number, start: number, length: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 24, length), flat(color));
  mesh.rotation.z = start;
  return mesh;
}

function buildFace(avatar: Avatar, head: Head, sleepy: boolean): THREE.Group {
  const face = new THREE.Group();
  const s = head.r / 0.27;
  const ex = 0.1 * s, ey = 0.01 * s;
  const onFace = (obj: THREE.Object3D, x: number, y: number, lift = 0.005) => {
    obj.position.set(x, head.y + y, head.surface(x, y) + lift);
    face.add(obj);
    return obj;
  };

  const kind = sleepy ? "endormis" : avatar.eyes;
  for (const side of [-1, 1]) {
    const x = side * ex;
    if (kind === "joyeux") {
      onFace(arc(0.035 * s, 0.009 * s, 0, Math.PI, INK), x, ey - 0.01 * s, 0.01);
    } else if (kind === "endormis") {
      onFace(arc(0.035 * s, 0.009 * s, Math.PI, Math.PI, INK), x, ey + 0.01 * s, 0.01);
    } else {
      const big = kind === "surpris";
      const white = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.05 * s : 0.042 * s, 20, 16), flat(0xffffff));
      white.scale.set(1, big ? 1 : 1.3, 0.45);
      onFace(white, x, ey);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry((big ? 0.018 : 0.024) * s, 16, 12), flat(INK));
      pupil.scale.z = 0.5;
      onFace(pupil, x + (kind === "malicieux" ? 0.012 * s : 0.006 * s), ey - 0.01 * s, (big ? 0.03 : 0.022) * s);
      if (kind === "malicieux") {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.016 * s, 0.01), flat(INK));
        brow.rotation.z = side * -0.25;
        onFace(brow, x, ey + 0.06 * s, 0.01);
      }
    }
  }

  // Joues
  for (const side of [-1, 1]) {
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 16, 12), flat(0xff9bb0));
    blush.scale.set(1.3, 0.7, 0.25);
    onFace(blush, side * 0.16 * s, -0.08 * s);
  }

  // Bouche
  const my = -0.11 * s;
  if (avatar.extra !== "moustache") {
    switch (avatar.mouth) {
      case "rire": {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat(INK));
        m.scale.set(1.2, 1, 0.4);
        onFace(m, 0, my + 0.015 * s);
        break;
      }
      case "o": {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.025 * s, 16, 12), flat(INK));
        m.scale.set(0.9, 1.15, 0.4);
        onFace(m, 0, my);
        break;
      }
      case "neutre":
        onFace(new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.014 * s, 0.01), flat(INK)), 0, my);
        break;
      case "langue": {
        onFace(arc(0.05 * s, 0.009 * s, Math.PI, Math.PI, INK), 0, my + 0.03 * s, 0.01);
        const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 16, 12), flat(0xff7a8a));
        tongue.scale.set(1, 1.2, 0.5);
        onFace(tongue, 0.015 * s, my - 0.01 * s, 0.012);
        break;
      }
      default:
        onFace(arc(0.05 * s, 0.009 * s, Math.PI, Math.PI, INK), 0, my + 0.03 * s, 0.01);
    }
  }
  return face;
}

function buildHat(avatar: Avatar, head: Head, accent: THREE.Color): THREE.Object3D | null {
  const mat = toon(accent);
  const white = toon(0xffffff);
  const r = head.r;
  const g = new THREE.Group();
  const square = avatar.shape === "carre";
  switch (avatar.hat) {
    case "casquette": {
      if (square) {
        g.add(outlined(place(new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.14, 0.52, 3, 0.06), mat), 0, head.top + 0.03, 0)));
        g.add(outlined(place(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.03, 0.24, 2, 0.012), mat), 0, head.top - 0.02, 0.32)));
        return g;
      }
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.03, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.1), mat);
      g.add(outlined(place(cap, 0, head.y + r * 0.15, 0)));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.03, 24, 1, false, -Math.PI / 2, Math.PI), mat);
      g.add(outlined(place(brim, 0, head.y + r * 0.2, r * 0.6)));
      return g;
    }
    case "couronne": {
      const gold = toon(accent);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.62, r * 0.32, 24, 1, true), gold);
      band.material.side = THREE.DoubleSide;
      g.add(place(band, 0, head.top - r * 0.02, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.3, 12), gold);
        g.add(place(spike, Math.sin(a) * r * 0.6, head.top + r * 0.28, Math.cos(a) * r * 0.6));
        const gem = new THREE.Mesh(new THREE.SphereGeometry(r * 0.05, 12, 8), flat(0xffffff));
        g.add(place(gem, Math.sin(a) * r * 0.62, head.top + r * 0.42, Math.cos(a) * r * 0.62));
      }
      return g;
    }
    case "pointu": {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, r * 1.5, 32), mat);
      g.add(outlined(place(cone, 0, head.top + r * 0.45, 0)));
      g.add(outlined(place(new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 16, 12), white), 0, head.top + r * 1.2, 0)));
      g.rotation.z = -0.15;
      return g;
    }
    case "bonnet": {
      if (square) {
        g.add(outlined(place(new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.2, 0.54, 3, 0.08), mat), 0, head.top + 0.04, 0)));
        g.add(outlined(place(new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 16, 12), white), 0, head.top + 0.2, 0)));
        return g;
      }
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.04, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      g.add(outlined(place(dome, 0, head.y + r * 0.2, 0)));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.12, 12, 32), toon(accent.clone().multiplyScalar(0.85)));
      rim.rotation.x = Math.PI / 2;
      g.add(place(rim, 0, head.y + r * 0.22, 0));
      g.add(outlined(place(new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 16, 12), white), 0, head.top + r * 0.25, 0)));
      return g;
    }
    case "noeud": {
      for (const side of [-1, 1]) {
        const lobe = new THREE.Mesh(new THREE.ConeGeometry(r * 0.22, r * 0.4, 16), mat);
        lobe.rotation.z = side * Math.PI / 2;
        g.add(place(lobe, side * r * 0.2, 0, 0));
      }
      g.add(place(new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 12, 8), mat), 0, 0, 0));
      g.position.set(r * 0.55, head.top - r * 0.15, r * 0.35);
      g.rotation.set(0, 0.6, -0.4);
      return g;
    }
    case "feuille": {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, r * 0.4, 8), toon(0x4f8a2b));
      g.add(place(stem, 0, head.top + r * 0.18, 0));
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r * 0.25, 16, 12), mat);
      leaf.scale.set(1.4, 0.35, 0.8);
      leaf.rotation.z = 0.5;
      g.add(outlined(place(leaf, r * 0.22, head.top + r * 0.42, 0)));
      return g;
    }
    default:
      return null;
  }
}

function buildExtra(avatar: Avatar, head: Head, accent: THREE.Color, body: THREE.Color): THREE.Object3D | null {
  const s = head.r / 0.27;
  const g = new THREE.Group();
  switch (avatar.extra) {
    case "lunettes": {
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06 * s, 0.01 * s, 8, 24), flat(INK));
        g.add(place(ring, side * 0.1 * s, head.y + 0.01 * s, head.surface(side * 0.1 * s, 0.01 * s) + 0.03 * s));
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.012 * s, 0.01), flat(INK));
      g.add(place(bridge, 0, head.y + 0.02 * s, head.surface(0, 0) + 0.035 * s));
      return g;
    }
    case "echarpe": {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22 * s, 0.05 * s, 12, 32), toon(accent));
      scarf.rotation.x = Math.PI / 2;
      g.add(outlined(place(scarf, 0, head.neck + 0.02, 0)));
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.2 * s, 0.04 * s), toon(accent));
      tail.rotation.z = 0.2;
      g.add(outlined(place(tail, 0.1 * s, head.neck - 0.1 * s, 0.2 * s)));
      return g;
    }
    case "moustache": {
      for (const side of [-1, 1]) {
        const half = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 16, 12), toon(body.clone().multiplyScalar(0.45)));
        half.scale.set(1.5, 0.6, 0.5);
        half.rotation.z = side * 0.25;
        g.add(place(half, side * 0.05 * s, head.y - 0.085 * s, head.surface(side * 0.05 * s, -0.085 * s) + 0.01));
      }
      return g;
    }
    case "papillon": {
      for (const side of [-1, 1]) {
        const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.09 * s, 12), toon(accent));
        lobe.rotation.z = side * Math.PI / 2;
        g.add(place(lobe, side * 0.045 * s, 0, 0));
      }
      g.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 12, 8), toon(accent.clone().multiplyScalar(0.7))), 0, 0, 0.01));
      g.position.set(0, head.neck, avatar.shape === "carre" ? 0.23 : 0.2 * s + 0.04);
      return g;
    }
    default:
      return null;
  }
}

/** Construit le pion 3D d'un avatar. `bot` ajoute une antenne. */
export function buildAvatar3D(avatar: Avatar, opts: { bot?: boolean; sleepy?: boolean } = {}): THREE.Group {
  const root = new THREE.Group();
  const bodyColor = new THREE.Color(AVATAR_COLORS[avatar.body]?.hex ?? "#999999");
  const accent = new THREE.Color(AVATAR_COLORS[avatar.accent]?.hex ?? "#F7C21B");
  const { group, head } = buildBodyAndHead(avatar, bodyColor);
  root.add(group);
  root.add(buildFace(avatar, head, Boolean(opts.sleepy)));
  const hat = buildHat(avatar, head, accent);
  if (hat) root.add(hat);
  const extra = buildExtra(avatar, head, accent, bodyColor);
  if (extra) root.add(extra);
  if (opts.bot) {
    const stalk = place(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), toon(INK)), -0.1, head.top + 0.06, 0);
    stalk.rotation.z = 0.35;
    root.add(stalk, place(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), toon(0xffc83d)), -0.13, head.top + 0.14, 0));
  }
  return root;
}

/** Libère la mémoire graphique d'un objet 3D (à appeler avant de le jeter). */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
