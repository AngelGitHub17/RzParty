/**
 * Avatar d'un joueur : une description (pas une image), dessinée en 2D (SVG) dans l'interface
 * et en 3D (Three.js) dans l'éditeur, puis sur le plateau.
 */

export const AVATAR_COLORS = [
  { id: "tomate", label: "Tomate", hex: "#F0483E" },
  { id: "abricot", label: "Abricot", hex: "#FF8A1F" },
  { id: "soleil", label: "Soleil", hex: "#F7C21B" },
  { id: "pomme", label: "Pomme", hex: "#7BCB3A" },
  { id: "sapin", label: "Sapin", hex: "#2DB866" },
  { id: "lagon", label: "Lagon", hex: "#18BDBD" },
  { id: "ciel", label: "Ciel", hex: "#4FB3F6" },
  { id: "ocean", label: "Océan", hex: "#2F7BEF" },
  { id: "raisin", label: "Raisin", hex: "#9257E8" },
  { id: "bonbon", label: "Bonbon", hex: "#F45FAE" },
  { id: "cacao", label: "Cacao", hex: "#9A6542" },
  { id: "nuage", label: "Nuage", hex: "#E9EEF4" },
  { id: "ardoise", label: "Ardoise", hex: "#5A6478" },
] as const;

export const AVATAR_SHAPES = { rond: "Rond", grand: "Grand", carre: "Carré", poire: "Poire" } as const;
export const AVATAR_EYES = { ronds: "Ronds", joyeux: "Joyeux", malicieux: "Malicieux", surpris: "Surpris", endormis: "Endormis" } as const;
export const AVATAR_MOUTHS = { sourire: "Sourire", rire: "Grand rire", o: "Étonné", langue: "Langue", neutre: "Neutre" } as const;
export const AVATAR_HATS = {
  aucun: "Aucun",
  casquette: "Casquette",
  couronne: "Couronne",
  pointu: "Chapeau pointu",
  bonnet: "Bonnet",
  noeud: "Nœud",
  feuille: "Feuille",
} as const;
export const AVATAR_EXTRAS = { aucun: "Aucun", lunettes: "Lunettes", echarpe: "Écharpe", moustache: "Moustache", papillon: "Nœud papillon" } as const;

export type AvatarShape = keyof typeof AVATAR_SHAPES;
export type AvatarEyes = keyof typeof AVATAR_EYES;
export type AvatarMouth = keyof typeof AVATAR_MOUTHS;
export type AvatarHat = keyof typeof AVATAR_HATS;
export type AvatarExtra = keyof typeof AVATAR_EXTRAS;

export interface Avatar {
  /** Index dans AVATAR_COLORS. */
  body: number;
  /** Couleur d'accent (chapeau, écharpe…), index dans AVATAR_COLORS. */
  accent: number;
  shape: AvatarShape;
  eyes: AvatarEyes;
  mouth: AvatarMouth;
  hat: AvatarHat;
  extra: AvatarExtra;
}

export const DEFAULT_AVATAR: Avatar = {
  body: 0,
  accent: 2,
  shape: "rond",
  eyes: "ronds",
  mouth: "sourire",
  hat: "aucun",
  extra: "aucun",
};

const pickKey = <T extends Record<string, string>>(table: T, value: unknown, fallback: keyof T): keyof T =>
  typeof value === "string" && value in table ? (value as keyof T) : fallback;

const pickColor = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < AVATAR_COLORS.length ? value : fallback;

/** Rend valide un avatar venu du réseau ou d'un fichier : toute valeur inconnue est remplacée. */
export function normalizeAvatar(raw: unknown): Avatar {
  const a = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Avatar, unknown>>;
  return {
    body: pickColor(a.body, DEFAULT_AVATAR.body),
    accent: pickColor(a.accent, DEFAULT_AVATAR.accent),
    shape: pickKey(AVATAR_SHAPES, a.shape, DEFAULT_AVATAR.shape),
    eyes: pickKey(AVATAR_EYES, a.eyes, DEFAULT_AVATAR.eyes),
    mouth: pickKey(AVATAR_MOUTHS, a.mouth, DEFAULT_AVATAR.mouth),
    hat: pickKey(AVATAR_HATS, a.hat, DEFAULT_AVATAR.hat),
    extra: pickKey(AVATAR_EXTRAS, a.extra, DEFAULT_AVATAR.extra),
  };
}

/** Avatar au hasard (bouton « Au hasard », bots). */
export function randomAvatar(random: () => number): Avatar {
  const one = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const body = Math.floor(random() * AVATAR_COLORS.length);
  let accent = Math.floor(random() * AVATAR_COLORS.length);
  if (accent === body) accent = (accent + 4) % AVATAR_COLORS.length;
  return {
    body,
    accent,
    shape: one(Object.keys(AVATAR_SHAPES) as AvatarShape[]),
    eyes: one(Object.keys(AVATAR_EYES) as AvatarEyes[]),
    mouth: one(Object.keys(AVATAR_MOUTHS) as AvatarMouth[]),
    hat: random() < 0.6 ? one(Object.keys(AVATAR_HATS) as AvatarHat[]) : "aucun",
    extra: random() < 0.4 ? one(Object.keys(AVATAR_EXTRAS) as AvatarExtra[]) : "aucun",
  };
}
