import { AVATAR_COLORS, DEFAULT_AVATAR, PLAYER_COLORS, type Avatar, type PublicPlayer } from "@rzparty/shared";
import { svg } from "./dom.ts";

const INK = "#1E2A4A";

/** Assombrit une couleur hexadécimale (contours et ombres). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface Geometry {
  body: string;
  head: string;
  /** Centre et rayon apparent de la tête (pour placer le visage et le chapeau). */
  hx: number;
  hy: number;
  hr: number;
  /** Hauteur du cou (écharpe, nœud papillon). */
  neck: number;
}

function geometry(shape: Avatar["shape"]): Geometry {
  switch (shape) {
    case "grand":
      return {
        body: `<path d="M32 70c0-10 8-16 18-16s18 6 18 16v26c0 7-6 12-13 12H45c-7 0-13-5-13-12z"/>`,
        head: `<circle cx="50" cy="36" r="23"/>`,
        hx: 50, hy: 36, hr: 23, neck: 58,
      };
    case "carre":
      return {
        body: `<rect x="24" y="62" width="52" height="44" rx="12"/>`,
        head: `<rect x="23" y="14" width="54" height="52" rx="17"/>`,
        hx: 50, hy: 40, hr: 26, neck: 66,
      };
    case "poire":
      return {
        body: `<path d="M38 62c4-4 20-4 24 0 10 8 22 22 22 32 0 9-7 14-16 14H32c-9 0-16-5-16-14 0-10 12-24 22-32z"/>`,
        head: `<circle cx="50" cy="40" r="22"/>`,
        hx: 50, hy: 40, hr: 22, neck: 61,
      };
    default:
      return {
        body: `<path d="M26 74c0-12 10-20 24-20s24 8 24 20v18c0 9-7 16-16 16H42c-9 0-16-7-16-16z"/>`,
        head: `<circle cx="50" cy="42" r="27"/>`,
        hx: 50, hy: 42, hr: 27, neck: 64,
      };
  }
}

function eyes(kind: Avatar["eyes"], g: Geometry): string {
  const dx = g.hr * 0.36, y = g.hy - g.hr * 0.06, lx = g.hx - dx, rx = g.hx + dx;
  const s = g.hr / 27;
  switch (kind) {
    case "joyeux":
      return `<path d="M${lx - 5 * s} ${y + 2 * s}q${5 * s} -${8 * s} ${10 * s} 0M${rx - 5 * s} ${y + 2 * s}q${5 * s} -${8 * s} ${10 * s} 0" stroke="${INK}" stroke-width="${3 * s}" fill="none" stroke-linecap="round"/>`;
    case "endormis":
      return `<path d="M${lx - 5 * s} ${y}q${5 * s} ${6 * s} ${10 * s} 0M${rx - 5 * s} ${y}q${5 * s} ${6 * s} ${10 * s} 0" stroke="${INK}" stroke-width="${3 * s}" fill="none" stroke-linecap="round"/>`;
    case "surpris":
      return `<circle cx="${lx}" cy="${y}" r="${7 * s}" fill="#fff"/><circle cx="${rx}" cy="${y}" r="${7 * s}" fill="#fff"/>
        <circle cx="${lx}" cy="${y}" r="${2.6 * s}" fill="${INK}"/><circle cx="${rx}" cy="${y}" r="${2.6 * s}" fill="${INK}"/>`;
    case "malicieux":
      return `<ellipse cx="${lx}" cy="${y}" rx="${5.5 * s}" ry="${6.5 * s}" fill="#fff"/><ellipse cx="${rx}" cy="${y}" rx="${5.5 * s}" ry="${6.5 * s}" fill="#fff"/>
        <circle cx="${lx + 2 * s}" cy="${y + 1.5 * s}" r="${3 * s}" fill="${INK}"/><circle cx="${rx + 2 * s}" cy="${y + 1.5 * s}" r="${3 * s}" fill="${INK}"/>
        <path d="M${lx - 7 * s} ${y - 6 * s}l${13 * s} ${3 * s}M${rx - 6 * s} ${y - 3 * s}l${13 * s} -${3 * s}" stroke="${INK}" stroke-width="${3 * s}" stroke-linecap="round"/>`;
    default:
      return `<ellipse cx="${lx}" cy="${y}" rx="${5.5 * s}" ry="${7.5 * s}" fill="#fff"/><ellipse cx="${rx}" cy="${y}" rx="${5.5 * s}" ry="${7.5 * s}" fill="#fff"/>
        <circle cx="${lx + 1 * s}" cy="${y + 2 * s}" r="${3.2 * s}" fill="${INK}"/><circle cx="${rx + 1 * s}" cy="${y + 2 * s}" r="${3.2 * s}" fill="${INK}"/>`;
  }
}

function mouth(kind: Avatar["mouth"], g: Geometry): string {
  const s = g.hr / 27, x = g.hx, y = g.hy + g.hr * 0.42;
  switch (kind) {
    case "rire":
      return `<path d="M${x - 8 * s} ${y - 2 * s}h${16 * s}q0 ${10 * s} -${8 * s} ${10 * s}t-${8 * s} -${10 * s}z" fill="${INK}"/><path d="M${x - 4 * s} ${y + 5 * s}q${4 * s} -${3 * s} ${8 * s} 0q-${4 * s} ${4 * s} -${8 * s} 0z" fill="#FF7A8A"/>`;
    case "o":
      return `<ellipse cx="${x}" cy="${y + 1 * s}" rx="${3.5 * s}" ry="${4.5 * s}" fill="${INK}"/>`;
    case "langue":
      return `<path d="M${x - 7 * s} ${y - 1 * s}q${7 * s} ${7 * s} ${14 * s} 0" stroke="${INK}" stroke-width="${2.8 * s}" fill="none" stroke-linecap="round"/><path d="M${x + 1 * s} ${y + 2 * s}q${1 * s} ${7 * s} ${5 * s} ${5 * s}q${2 * s} -${2 * s} 0 -${7 * s}z" fill="#FF7A8A" stroke="${INK}" stroke-width="${1.4 * s}"/>`;
    case "neutre":
      return `<path d="M${x - 6 * s} ${y + 1 * s}h${12 * s}" stroke="${INK}" stroke-width="${2.8 * s}" stroke-linecap="round"/>`;
    default:
      return `<path d="M${x - 7 * s} ${y - 1 * s}q${7 * s} ${7 * s} ${14 * s} 0" stroke="${INK}" stroke-width="${2.8 * s}" fill="none" stroke-linecap="round"/>`;
  }
}

function hat(kind: Avatar["hat"], g: Geometry, accent: string): string {
  const top = g.hy - g.hr, dark = shade(accent, 0.3), x = g.hx, w = g.hr;
  const stroke = `stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"`;
  switch (kind) {
    case "casquette":
      return `<path d="M${x - w * 0.95} ${top + w * 0.55}a${w * 0.95} ${w * 0.75} 0 0 1 ${w * 1.9} 0z" fill="${accent}" ${stroke}/><path d="M${x + w * 0.2} ${top + w * 0.5}h${w * 1.15}q${w * 0.2} ${w * 0.18} -${w * 0.1} ${w * 0.22}h-${w * 1.05}z" fill="${accent}" ${stroke}/>`;
    case "couronne":
      return `<path d="M${x - w * 0.7} ${top + w * 0.3}l-${w * 0.08} -${w * 0.7}l${w * 0.4} ${w * 0.35}l${w * 0.38} -${w * 0.55}l${w * 0.38} ${w * 0.55}l${w * 0.4} -${w * 0.35}l-${w * 0.08} ${w * 0.7}z" fill="${accent}" ${stroke}/>`;
    case "pointu":
      return `<path d="M${x - w * 0.75} ${top + w * 0.35}L${x + w * 0.1} ${top - w * 1.05}L${x + w * 0.75} ${top + w * 0.35}z" fill="${accent}" ${stroke}/><circle cx="${x + w * 0.1}" cy="${top - w * 1.05}" r="${w * 0.17}" fill="#fff" ${stroke}/>`;
    case "bonnet":
      return `<path d="M${x - w * 0.92} ${top + w * 0.55}c0-${w * 0.9} ${w * 1.84}-${w * 0.9} ${w * 1.84} 0z" fill="${accent}" ${stroke}/><rect x="${x - w * 0.98}" y="${top + w * 0.42}" width="${w * 1.96}" height="${w * 0.3}" rx="${w * 0.12}" fill="${shade(accent, 0.12)}" ${stroke}/><circle cx="${x}" cy="${top - w * 0.3}" r="${w * 0.2}" fill="#fff" ${stroke}/>`;
    case "noeud":
      return `<g transform="translate(${x + w * 0.55} ${top + w * 0.2}) rotate(-20)"><path d="M0 0l-${w * 0.45} -${w * 0.28}v${w * 0.56}zM0 0l${w * 0.45} -${w * 0.28}v${w * 0.56}z" fill="${accent}" ${stroke}/><circle r="${w * 0.12}" fill="${dark}"/></g>`;
    case "feuille":
      return `<path d="M${x} ${top + 2}c0-${w * 0.3} 0-${w * 0.45} ${w * 0.05}-${w * 0.55}" stroke="#4F8A2B" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M${x + w * 0.05} ${top - w * 0.5}c${w * 0.25}-${w * 0.35} ${w * 0.7}-${w * 0.35} ${w * 0.85}-${w * 0.2}c-${w * 0.2} ${w * 0.35}-${w * 0.6} ${w * 0.4}-${w * 0.85} ${w * 0.2}z" fill="${accent}" ${stroke}/>`;
    default:
      return "";
  }
}

function extra(kind: Avatar["extra"], g: Geometry, accent: string, body: string): string {
  const s = g.hr / 27, dark = shade(accent, 0.3);
  const dx = g.hr * 0.36, y = g.hy - g.hr * 0.06;
  switch (kind) {
    case "lunettes":
      return `<g fill="#ffffff33" stroke="${INK}" stroke-width="${2.6 * s}"><circle cx="${g.hx - dx}" cy="${y}" r="${9 * s}"/><circle cx="${g.hx + dx}" cy="${y}" r="${9 * s}"/><path d="M${g.hx - dx + 9 * s} ${y}h${2 * dx - 18 * s}" fill="none"/></g>`;
    case "echarpe":
      return `<path d="M${g.hx - 22} ${g.neck - 3}q22 9 44 0v8q-22 9-44 0z" fill="${accent}" stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"/><path d="M${g.hx + 8} ${g.neck + 4}l5 16h9l-5-16z" fill="${accent}" stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"/>`;
    case "moustache":
      return `<path d="M${g.hx} ${g.hy + g.hr * 0.3}c-${4 * s} -${5 * s} -${12 * s} -${4 * s} -${13 * s} ${2 * s}c${5 * s} -${1 * s} ${9 * s} ${2 * s} ${13 * s} 0c${4 * s} ${2 * s} ${8 * s} -${1 * s} ${13 * s} 0c-${1 * s} -${6 * s} -${9 * s} -${7 * s} -${13 * s} -${2 * s}z" fill="${shade(body, 0.55)}"/>`;
    case "papillon":
      return `<g transform="translate(${g.hx} ${g.neck + 2})"><path d="M0 0l-11-7v14zM0 0l11-7v14z" fill="${accent}" stroke="${dark}" stroke-width="2.2" stroke-linejoin="round"/><circle r="3" fill="${dark}"/></g>`;
    default:
      return "";
  }
}

export interface AvatarOptions {
  size?: number;
  /** Ajoute une antenne : signale un bot. */
  bot?: boolean;
  /** Yeux fermés (joueur absent ou éliminé). */
  sleepy?: boolean;
}

/** Dessine un avatar en SVG. */
export function avatarSvg(raw: Avatar | undefined, opts: AvatarOptions = {}): SVGSVGElement {
  const a = raw ?? DEFAULT_AVATAR;
  const size = opts.size ?? 96;
  const body = AVATAR_COLORS[a.body]?.hex ?? "#999999";
  const accent = AVATAR_COLORS[a.accent]?.hex ?? "#F7C21B";
  const dark = shade(body, 0.3);
  const g = geometry(a.shape);
  const antenna = opts.bot
    ? `<line x1="${g.hx - g.hr * 0.5}" y1="${g.hy - g.hr * 0.8}" x2="${g.hx - g.hr * 0.75}" y2="${g.hy - g.hr * 1.3}" stroke="${dark}" stroke-width="3" stroke-linecap="round"/><circle cx="${g.hx - g.hr * 0.75}" cy="${g.hy - g.hr * 1.3}" r="4" fill="#FFC83D" stroke="${dark}" stroke-width="2"/>`
    : "";
  return svg(`
    <svg class="pawn" viewBox="0 -14 100 128" width="${size}" height="${Math.round(size * 1.28)}" aria-hidden="true">
      <ellipse cx="50" cy="108" rx="30" ry="6" fill="${INK}" opacity=".16"/>
      ${antenna}
      <g fill="${body}" stroke="${dark}" stroke-width="3" stroke-linejoin="round">${g.body}${g.head}</g>
      <ellipse cx="${g.hx - g.hr * 0.38}" cy="${g.hy - g.hr * 0.55}" rx="${g.hr * 0.32}" ry="${g.hr * 0.18}" fill="#fff" opacity=".35" transform="rotate(-20 ${g.hx - g.hr * 0.38} ${g.hy - g.hr * 0.55})"/>
      ${extra(a.extra === "echarpe" || a.extra === "papillon" ? a.extra : "aucun", g, accent, body)}
      ${eyes(opts.sleepy ? "endormis" : a.eyes, g)}
      <ellipse cx="${g.hx - g.hr * 0.6}" cy="${g.hy + g.hr * 0.3}" rx="${g.hr * 0.18}" ry="${g.hr * 0.11}" fill="#FF8FA3" opacity=".55"/>
      <ellipse cx="${g.hx + g.hr * 0.6}" cy="${g.hy + g.hr * 0.3}" rx="${g.hr * 0.18}" ry="${g.hr * 0.11}" fill="#FF8FA3" opacity=".55"/>
      ${a.extra === "moustache" ? "" : mouth(a.mouth, g)}
      ${a.extra === "lunettes" || a.extra === "moustache" ? extra(a.extra, g, accent, body) : ""}
      ${hat(a.hat, g, accent)}
    </svg>`);
}

/** Avatar d'un joueur du salon. */
export function playerAvatar(p: Pick<PublicPlayer, "avatar" | "isBot">, opts: Omit<AvatarOptions, "bot"> = {}): SVGSVGElement {
  return avatarSvg(p.avatar, { ...opts, bot: p.isBot });
}

/** Couleur de place d'un joueur (socle, contour, barres). */
export function seatHex(color: number): string {
  return PLAYER_COLORS[color]?.hex ?? "#999999";
}

/** Compatibilité : petit pion « par défaut » d'une couleur de place (décors de l'accueil). */
export function pawn(color: number, opts: AvatarOptions = {}): SVGSVGElement {
  const body = [0, 7, 2, 4, 8, 1, 9, 5][color] ?? 0;
  return avatarSvg({ ...DEFAULT_AVATAR, body, accent: (body + 4) % 13 }, opts);
}
