import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CELL_INFO, PLAYER_COLORS, TEAMS, type Board, type BoardState, type DieRoll, type PublicPlayer } from "@rzparty/shared";
import { buildAvatar3D, disposeObject } from "./avatar3d.ts";

const STEP_MS = 330;
const CELL_RADIUS = 0.56;
const PAWN_SCALE = 0.78;
const DIE_SIZE = 0.62;
const DIE_HEIGHT = 1.8;

/** Décalage de la caméra par rapport au point suivi, selon ce qui se passe. */
const CAMERA = {
  roll: { up: 3.6, back: 5.0, look: 1.1 },
  move: { up: 6.2, back: 6.4, look: 0.4 },
  idle: { up: 8.0, back: 8.0, look: 0 },
};

function shade(hex: string, amount: number): THREE.Color {
  const c = new THREE.Color(hex);
  return amount < 0 ? c.lerp(new THREE.Color(0x1e2a4a), -amount) : c.lerp(new THREE.Color(0xffffff), amount);
}

let gradientMap: THREE.DataTexture | null = null;
function toon(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap });
}

/** Symbole dessiné sur le dessus d'une case (+, −, !, D, A…). */
function symbolTexture(symbol: string, ink: string, outline: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "700 200px 'Fredoka Variable', 'Fredoka', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 26;
  ctx.strokeStyle = outline;
  ctx.strokeText(symbol, 128, 140);
  ctx.fillStyle = ink;
  ctx.fillText(symbol, 128, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Style d'un dé : classique blanc, dés bonus métalliques (or = 1 à 6, argent = 1 à 3, bronze = 1 à 2),
 * ou dé bleu à 12 faces (chiffres).
 */
type DieStyle = "normal" | "or" | "argent" | "bronze" | "douze";
const DIE_LOOK: Record<DieStyle, { light: string; dark: string; ink: string }> = {
  normal: { light: "#FFFFFF", dark: "#FFFFFF", ink: "#1E2A4A" },
  or: { light: "#FFE58A", dark: "#D99A0B", ink: "#5A3A00" },
  argent: { light: "#FFFFFF", dark: "#A9B1BD", ink: "#2B313B" },
  bronze: { light: "#F2B98A", dark: "#A8612D", ink: "#3B1D07" },
  douze: { light: "#5D9BFF", dark: "#2F7BEF", ink: "#FFFFFF" },
};
const styleOf = (r: { kind: DieRoll["kind"]; sides: number }): DieStyle =>
  r.kind === "douze" ? "douze" : r.kind === "bonus" ? (r.sides >= 6 ? "or" : r.sides >= 3 ? "argent" : "bronze") : "normal";

function dieFaceTexture(value: number, style: DieStyle): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const look = DIE_LOOK[style];
  // Reflet métallique : dégradé en diagonale.
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, look.light);
  grad.addColorStop(0.55, look.dark);
  grad.addColorStop(1, look.light);
  ctx.fillStyle = style === "normal" ? look.light : grad;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = look.ink;
  if (style === "douze") {
    ctx.font = `700 ${value >= 10 ? 74 : 92}px 'Fredoka Variable', 'Fredoka', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), 64, 70);
    if (value === 6 || value === 9) ctx.fillRect(40, 112, 48, 6);
  } else {
    const at: Record<number, [number, number][]> = {
      1: [[64, 64]],
      2: [[34, 34], [94, 94]],
      3: [[32, 32], [64, 64], [96, 96]],
      4: [[34, 34], [94, 34], [34, 94], [94, 94]],
      5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]],
      6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]],
    };
    for (const [x, y] of at[value] ?? []) {
      ctx.beginPath();
      ctx.arc(x, y, value === 1 ? 15 : 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Valeurs portées par les 6 faces du cube, dans l'ordre des faces de three.js (+x, −x, +y, −y, +z, −z).
 * Dé à 6 faces : faces opposées qui font 7. Dés bonus (4 ou 3 faces) : chiffres répétés.
 */
function dieFaces(sides: number): number[] {
  if (sides === 6) return [3, 4, 1, 6, 2, 5];
  if (sides === 12) return [2, 5, 8, 11, 12, 7];
  return Array.from({ length: 6 }, (_, i) => (i % sides) + 1);
}
/** Normale et « haut » de l'image pour chaque face du cube. */
const FACE_FRAMES: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)],
  [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
];

interface DieView {
  mesh: THREE.Mesh;
  sides: number;
  kind: DieRoll["kind"];
  /** Faces portées par le cube (la face du résultat est réécrite si besoin, ex. dé à 12 faces). */
  faces: number[];
  value: number | null;
  spin: THREE.Vector3;
  /** Moment où le dé a apparu (pour l'animation de lancer). */
  born: number;
  landedAt: number | null;
  fromQuat: THREE.Quaternion;
}

interface PawnView {
  group: THREE.Group;
  avatarKey: string;
  cell: number;
  /** Animation de saut en cours. */
  hops: { from: THREE.Vector3; to: THREE.Vector3; start: number }[];
}

/**
 * Le plateau en 3D : une île, des cases colorées, les pions des joueurs.
 * La caméra suit le joueur dont c'est le tour ; les pions sautent de case en case.
 */
export class BoardScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private camTarget = new THREE.Vector3();
  private camGoal = new THREE.Vector3();
  private boardKey = "";
  private boardGroup = new THREE.Group();
  private cellPos: THREE.Vector3[] = [];
  private pawns = new Map<string, PawnView>();
  private markers = new THREE.Group();
  private lastMoveId = -1;
  private focusId: string | null = null;
  private overview = false;
  private observer: ResizeObserver;
  private bounds = new THREE.Box3();
  private dice: DieView[] = [];
  private diceKey = "";
  private diceGroup = new THREE.Group();
  private phase: string | null = null;
  private camOffset = { ...CAMERA.idle };
  private dieGeo = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, 0.1);
  private faceMats = new Map<string, THREE.MeshToonMaterial | THREE.MeshStandardMaterial>();
  private blockedMark: THREE.Mesh | null = null;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.classList.add("board3d__canvas");
    host.append(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9fd3f5, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);
    this.scene.add(this.boardGroup, this.markers, this.diceGroup);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();

    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.tick(now, dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Construit l'île et les cases (une seule fois par plateau). */
  private buildBoard(board: Board): void {
    disposeObject(this.boardGroup);
    this.boardGroup.clear();
    this.cellPos = board.cells.map((c) => new THREE.Vector3(c.x, 0, c.z));

    this.bounds.makeEmpty();
    for (const p of this.cellPos) this.bounds.expandByPoint(p);
    const center = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());

    // Mer et île.
    const sea = new THREE.Mesh(new THREE.CircleGeometry(Math.max(size.x, size.z) * 1.6 + 30, 64), toon(0x7ccff5));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(center.x, -0.62, center.z);
    this.boardGroup.add(sea);
    const islandShape = new THREE.Shape();
    const w = size.x / 2 + 2.6;
    const d = size.z / 2 + 2.6;
    const r = 2.4;
    islandShape.moveTo(-w + r, -d);
    islandShape.lineTo(w - r, -d);
    islandShape.quadraticCurveTo(w, -d, w, -d + r);
    islandShape.lineTo(w, d - r);
    islandShape.quadraticCurveTo(w, d, w - r, d);
    islandShape.lineTo(-w + r, d);
    islandShape.quadraticCurveTo(-w, d, -w, d - r);
    islandShape.lineTo(-w, -d + r);
    islandShape.quadraticCurveTo(-w, -d, -w + r, -d);
    const islandGeo = new THREE.ExtrudeGeometry(islandShape, { depth: 0.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.2, bevelSegments: 3 });
    const island = new THREE.Mesh(islandGeo, [toon(0x7ed957), toon(0xc9955c)]);
    island.rotation.x = -Math.PI / 2;
    island.position.set(center.x, -0.8, center.z);
    this.boardGroup.add(island);

    // Tout ce qui se répète (arbres, galets, cases) est dessiné en « instances » :
    // un seul objet 3D par forme et par couleur, même pour un plateau de 2000 cases.
    const put = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; at: THREE.Matrix4[] }>();
    const add = (key: string, geo: THREE.BufferGeometry, mat: () => THREE.Material, matrix: THREE.Matrix4) => {
      let slot = put.get(key);
      if (!slot) put.set(key, (slot = { geo, mat: mat(), at: [] }));
      slot.at.push(matrix);
    };
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const noTurn = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const place = (x: number, y: number, z: number, q = noTurn, scale = one) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, scale);

    // Arbres décoratifs autour du parcours (une grille sert à éviter les cases rapidement).
    const rand = (() => {
      let s = board.seed >>> 0;
      return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    const near = new Set(this.cellPos.map((p) => `${Math.round(p.x / 1.3)}:${Math.round(p.z / 1.3)}`));
    const blocked = (x: number, z: number) => {
      const gx = Math.round(x / 1.3), gz = Math.round(z / 1.3);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (near.has(`${gx + dx}:${gz + dz}`)) return true;
      return false;
    };
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8);
    const crownGeo = new THREE.SphereGeometry(1, 12, 10);
    for (let i = 0; i < Math.min(4000, Math.round((size.x * size.z) / 18)); i++) {
      const x = center.x + (rand() - 0.5) * (size.x + 3.5);
      const z = center.z + (rand() - 0.5) * (size.z + 3.5);
      const r = 0.38 + rand() * 0.2;
      const light = rand() < 0.5;
      if (blocked(x, z)) continue;
      add("trunk", trunkGeo, () => toon(0x9a6542), place(x, 0.2, z));
      add(light ? "crownA" : "crownB", crownGeo, () => toon(light ? 0x3fae49 : 0x52c45a), place(x, 0.65, z, noTurn, new THREE.Vector3(r, r, r)));
    }

    // Liens entre les cases : petits galets qui montrent le sens.
    const stone = new THREE.CylinderGeometry(0.09, 0.11, 0.06, 10);
    const tmp = new THREE.Vector3();
    for (const cell of board.cells) {
      for (const n of cell.next) {
        const a = this.cellPos[cell.id]!;
        const b = this.cellPos[n]!;
        for (const t of [0.4, 0.6]) {
          tmp.lerpVectors(a, b, t);
          add("stone", stone, () => toon(0xf4e9cf), place(tmp.x, 0.03, tmp.z));
        }
      }
    }

    // Cases : un socle plus foncé, un dessus coloré bordé de blanc, un grand symbole contouré.
    const baseGeo = new THREE.CylinderGeometry(CELL_RADIUS * 1.04, CELL_RADIUS * 1.12, 0.2, 32);
    const rimGeo = new THREE.CylinderGeometry(CELL_RADIUS * 0.98, CELL_RADIUS * 0.98, 0.06, 32);
    const topGeo = new THREE.CylinderGeometry(CELL_RADIUS * 0.84, CELL_RADIUS * 0.84, 0.08, 32);
    const symbolGeo = new THREE.CircleGeometry(CELL_RADIUS * 0.82, 32);
    for (const cell of board.cells) {
      const info = CELL_INFO[cell.type];
      const at = this.cellPos[cell.id]!;
      add(`b${cell.type}`, baseGeo, () => toon(shade(info.color, -0.3)), place(at.x, 0.1, at.z));
      add("rim", rimGeo, () => toon(0xffffff), place(at.x, 0.23, at.z));
      add(`t${cell.type}`, topGeo, () => toon(info.color), place(at.x, 0.27, at.z));
      if (info.symbol) {
        const light = cell.type === "depart" || cell.type === "arrivee" || cell.type === "boutique";
        add(
          `s${cell.type}`,
          symbolGeo,
          () =>
            new THREE.MeshBasicMaterial({
              map: symbolTexture(info.symbol, light ? "#1E2A4A" : "#FFFFFF", light ? "#FFFFFF" : `#${shade(info.color, -0.45).getHexString()}`),
              transparent: true,
              depthWrite: false,
            }),
          place(at.x, 0.315, at.z, flat),
        );
      }
      if (cell.type === "arrivee") this.boardGroup.add(this.finishArch(at));
    }

    for (const { geo, mat, at } of put.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, at.length);
      at.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      this.boardGroup.add(mesh);
    }
  }

  private finishArch(at: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 10), toon(0xffffff));
      post.position.set(side * 0.75, 0.8, 0);
      g.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 0.06), toon(0xffc83d));
    banner.position.set(0, 1.5, 0);
    g.add(banner);
    g.position.copy(at);
    return g;
  }

  /** Position d'un pion sur sa case (décalée si plusieurs pions partagent la case). */
  private slot(cell: number, playerId: string, state: BoardState): THREE.Vector3 {
    const base = this.cellPos[cell]?.clone() ?? new THREE.Vector3();
    const together = Object.entries(state.pawns).filter(([, p]) => p.cell === cell).map(([id]) => id);
    if (together.length > 1) {
      const i = together.indexOf(playerId);
      const angle = (i / together.length) * Math.PI * 2;
      base.x += Math.cos(angle) * 0.32;
      base.z += Math.sin(angle) * 0.32;
    }
    return base.setY(0.31);
  }

  update(state: BoardState, players: PublicPlayer[], opts: { overview?: boolean } = {}): void {
    const key = `${state.board.seed}:${state.board.size}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      this.buildBoard(state.board);
      this.camTarget.copy(this.cellPos[state.board.start]!);
    }
    this.overview = Boolean(opts.overview);

    // Pions : création, avatar mis à jour, position.
    for (const [id, pawnState] of Object.entries(state.pawns)) {
      const player = players.find((p) => p.id === id);
      if (!player) continue;
      const team = state.teams?.[id];
      const avatarKey = JSON.stringify(player.avatar) + player.isBot + (team ?? "");
      let view = this.pawns.get(id);
      if (!view || view.avatarKey !== avatarKey) {
        if (view) {
          this.scene.remove(view.group);
          disposeObject(view.group);
        }
        const group = new THREE.Group();
        const model = buildAvatar3D(player.avatar, { bot: player.isBot });
        model.scale.setScalar(PAWN_SCALE);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), toon(team !== undefined ? (TEAMS[team]?.hex ?? "#ffffff") : (PLAYER_COLORS[player.color]?.hex ?? "#ffffff")));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.03;
        group.add(model, ring);
        group.position.copy(this.slot(pawnState.cell, id, state));
        this.scene.add(group);
        view = { group, avatarKey, cell: pawnState.cell, hops: [] };
        this.pawns.set(id, view);
      }
      // Nouveau déplacement : le pion saute de case en case le long du chemin.
      const turn = state.turn;
      if (turn && turn.playerId === id && turn.moveId !== this.lastMoveId && turn.path.length) {
        this.lastMoveId = turn.moveId;
        let from = view.group.position.clone();
        const start = performance.now();
        view.hops = turn.path.map((cellId, i) => {
          const to = i === turn.path.length - 1 ? this.slot(cellId, id, state) : this.cellPos[cellId]!.clone().setY(0.31);
          const hop = { from, to, start: start + i * STEP_MS };
          from = to;
          return hop;
        });
      } else if (!view.hops.length) {
        view.group.position.copy(this.slot(pawnState.cell, id, state));
      }
      view.cell = pawnState.cell;
    }
    for (const [id, view] of this.pawns) {
      if (state.pawns[id]) continue;
      this.scene.remove(view.group);
      disposeObject(view.group);
      this.pawns.delete(id);
    }

    // Embranchement : des flèches au-dessus des chemins proposés.
    disposeObject(this.markers);
    this.markers.clear();
    for (const choice of state.turn?.choices ?? []) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 16), toon(choice.detour ? 0xff8a1f : 0x2db866));
      arrow.rotation.x = Math.PI;
      arrow.position.copy(this.cellPos[choice.cell]!).setY(1.1);
      arrow.userData.base = 1.1;
      this.markers.add(arrow);
    }

    this.focusId = state.turn?.playerId ?? null;
    this.phase = state.turn?.phase ?? null;
    this.updateDice(state);
    this.updateBlocked(state);
  }

  private faceMaterial(value: number, style: DieStyle): THREE.Material & { map: THREE.Texture | null } {
    const key = `${style}${value}`;
    let m = this.faceMats.get(key);
    if (!m) {
      const map = dieFaceTexture(value, style);
      // Les dés bonus brillent comme du métal ; les autres gardent le rendu « dessin animé ».
      m = style === "or" || style === "argent" || style === "bronze" ? new THREE.MeshStandardMaterial({ map, metalness: 0.45, roughness: 0.3 }) : toon(0xffffff);
      m.map = map;
      this.faceMats.set(key, m);
    }
    return m;
  }

  private makeDie(r: DieRoll): DieView {
    const faces = dieFaces(r.sides);
    const style = styleOf(r);
    const mesh = new THREE.Mesh(this.dieGeo, faces.map((v) => this.faceMaterial(v, style)));
    if (r.kind === "bonus") mesh.scale.setScalar(0.85);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.diceGroup.add(mesh);
    return {
      mesh,
      sides: r.sides,
      kind: r.kind,
      faces,
      value: null,
      spin: new THREE.Vector3(9 + Math.random() * 6, 7 + Math.random() * 6, 5 + Math.random() * 5),
      born: performance.now(),
      landedAt: null,
      fromQuat: new THREE.Quaternion(),
    };
  }

  /**
   * Dés au-dessus du joueur : présents dès le début de son tour (ils flottent),
   * ils tournent pendant le lancer, puis montrent le résultat à la caméra.
   */
  private updateDice(state: BoardState): void {
    const turn = state.turn;
    const visible = turn && ["roll", "rolling", "move", "choose", "shop"].includes(turn.phase) && turn.rolls.length > 0;
    const key = visible ? `${state.boardRound}:${turn.playerId}` : "";
    if (key !== this.diceKey) {
      this.diceKey = key;
      for (const d of this.dice) this.diceGroup.remove(d.mesh);
      this.dice = [];
    }
    if (!visible || !turn) return;
    // Synchronise les dés avec le lancer (objet Dé à 12 faces, 3e dé d'un double…).
    turn.rolls.forEach((r, i) => {
      const d = this.dice[i];
      if (!d || d.sides !== r.sides || d.kind !== r.kind) {
        if (d) this.diceGroup.remove(d.mesh);
        this.dice[i] = this.makeDie(r);
      }
    });
    for (const extra of this.dice.splice(turn.rolls.length)) this.diceGroup.remove(extra.mesh);
    turn.rolls.forEach((r, i) => {
      const d = this.dice[i]!;
      if (r.value === null || d.value !== null) return;
      d.value = r.value;
      d.landedAt = performance.now();
      d.fromQuat.copy(d.mesh.quaternion);
      // Résultat absent des 6 faces du cube (dé à 12 faces) : on l'imprime sur la face avant.
      if (!d.faces.includes(r.value)) {
        d.faces = [...d.faces];
        d.faces[4] = r.value;
        (d.mesh.material as THREE.Material[])[4] = this.faceMaterial(r.value, styleOf(d));
      }
    });
  }

  /** Case d'arrivée qui ne s'active pas (pas d'effet en chaîne) : un voile gris la recouvre. */
  private updateBlocked(state: BoardState): void {
    const cell = state.turn?.effect?.blocked;
    if (cell === undefined) {
      if (this.blockedMark) this.blockedMark.visible = false;
      return;
    }
    if (!this.blockedMark) {
      this.blockedMark = new THREE.Mesh(
        new THREE.CircleGeometry(CELL_RADIUS * 1.08, 32),
        new THREE.MeshBasicMaterial({ color: 0x7d8799, transparent: true, opacity: 0.82, depthWrite: false }),
      );
      this.blockedMark.rotation.x = -Math.PI / 2;
      this.scene.add(this.blockedMark);
    }
    this.blockedMark.visible = true;
    this.blockedMark.position.copy(this.cellPos[cell] ?? new THREE.Vector3()).setY(0.33);
  }

  /** Orientation qui tourne la face portant `value` vers la caméra, à l'endroit. */
  private faceTowardCamera(d: DieView): THREE.Quaternion {
    const index = Math.max(0, d.faces.indexOf(d.value!));
    const [n, u] = FACE_FRAMES[index]!;
    const local = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(u, n), u, n);
    const toCam = this.camera.position.clone().sub(d.mesh.position).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    up.sub(toCam.clone().multiplyScalar(up.dot(toCam))).normalize();
    const world = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, toCam), up, toCam);
    return new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.transpose()));
  }

  private tickDice(now: number, dt: number): void {
    if (!this.dice.length) return;
    const pawn = this.focusId ? this.pawns.get(this.focusId)?.group.position : undefined;
    if (!pawn) return;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const n = this.dice.length;
    this.dice.forEach((d, i) => {
      // Lancer : le dé jaillit au-dessus du pion, puis flotte.
      const appear = Math.min(1, (now - d.born) / 350);
      const bounce = d.landedAt ? Math.max(0, 1 - (now - d.landedAt) / 400) : 0;
      const y = pawn.y + DIE_HEIGHT * (0.4 + 0.6 * appear) + Math.sin(now / 300 + i) * 0.06 + Math.sin(bounce * Math.PI) * 0.35;
      d.mesh.position.copy(pawn).addScaledVector(right, (i - (n - 1) / 2) * 0.85).setY(y);
      if (d.value === null) {
        // Avant le lancer, le dé tourne doucement en attendant ; pendant le lancer, il s'emballe.
        const speed = this.phase === "roll" ? 0.08 : 1;
        d.mesh.rotation.x += d.spin.x * dt * speed;
        d.mesh.rotation.y += d.spin.y * dt * speed;
        d.mesh.rotation.z += d.spin.z * dt * speed;
      } else {
        const t = Math.min(1, (now - d.landedAt!) / 450);
        const ease = 1 - Math.pow(1 - t, 3);
        d.mesh.quaternion.slerpQuaternions(d.fromQuat, this.faceTowardCamera(d), ease);
      }
    });
  }

  private tick(now: number, dt: number): void {
    // Sauts des pions.
    for (const view of this.pawns.values()) {
      while (view.hops.length && now > view.hops[0]!.start + STEP_MS) {
        view.group.position.copy(view.hops.shift()!.to);
      }
      const hop = view.hops[0];
      if (hop && now >= hop.start) {
        const t = (now - hop.start) / STEP_MS;
        view.group.position.lerpVectors(hop.from, hop.to, t);
        view.group.position.y += Math.sin(Math.PI * t) * 0.45;
        const dx = hop.to.x - hop.from.x;
        const dz = hop.to.z - hop.from.z;
        if (Math.hypot(dx, dz) > 0.01) view.group.rotation.y = Math.atan2(dx, dz);
      }
    }
    // Flèches qui flottent.
    for (const m of this.markers.children) m.position.y = (m.userData.base as number) + Math.sin(now / 250) * 0.12;

    // Caméra : vue d'ensemble, ou elle suit le joueur dont c'est le tour.
    const center = this.bounds.isEmpty() ? new THREE.Vector3() : this.bounds.getCenter(new THREE.Vector3());
    const focus = this.focusId ? this.pawns.get(this.focusId)?.group.position : undefined;
    if (this.overview || !focus) {
      let size = this.bounds.isEmpty() ? 10 : Math.max(this.bounds.max.x - this.bounds.min.x, this.bounds.max.z - this.bounds.min.z);
      this.camGoal.copy(center);
      // Très grand plateau : la vue d'ensemble se limite à la zone où se trouvent les pions.
      if (size > 45 && this.pawns.size) {
        const box = new THREE.Box3();
        for (const v of this.pawns.values()) box.expandByPoint(v.group.position);
        box.getCenter(this.camGoal).setY(0);
        size = Math.min(45, Math.max(18, box.max.x - box.min.x + 8, box.max.z - box.min.z + 8));
      }
      this.camTarget.lerp(this.camGoal, Math.min(1, dt * 2));
      this.camera.position.set(this.camTarget.x, size * 0.75 + 4, this.camTarget.z + size * 0.6 + 4);
    } else {
      // Zoom sur le joueur dont c'est le tour : très près pour le lancer, un peu plus large pendant qu'il avance.
      const want = this.phase === "roll" || this.phase === "rolling" ? CAMERA.roll : this.phase === "move" || this.phase === "choose" || this.phase === "effect" ? CAMERA.move : CAMERA.idle;
      const k = Math.min(1, dt * 2.5);
      this.camOffset.up += (want.up - this.camOffset.up) * k;
      this.camOffset.back += (want.back - this.camOffset.back) * k;
      this.camOffset.look += (want.look - this.camOffset.look) * k;
      this.camGoal.copy(focus).setY(focus.y + this.camOffset.look);
      this.camTarget.lerp(this.camGoal, Math.min(1, dt * 3));
      this.camera.position.set(this.camTarget.x, this.camTarget.y + this.camOffset.up, this.camTarget.z + this.camOffset.back);
    }
    this.camera.lookAt(this.camTarget);
    this.tickDice(now, dt);
  }

  private resize(): void {
    const w = this.host.clientWidth || 640;
    const h = this.host.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.dieGeo.dispose();
    for (const m of this.faceMats.values()) (m.map?.dispose(), m.dispose());
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
