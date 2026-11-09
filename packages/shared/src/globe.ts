/**
 * Mode « Tour du monde » : une carte du monde en boucle, des cartes de transport pour se
 * déplacer, et des photos-souvenirs à acheter (10 pièces) dans les destinations à la une.
 * Le plus de photos gagne (les pièces départagent).
 */

export type SpaceKind =
  | "depart" // reçoit une carte de transport
  | "destination" // photo-souvenir si elle est à la une (10 pièces)
  | "boutique" // acheter des cartes
  | "aeroport" // s'envoler vers un autre aéroport (5 pièces)
  | "port" // traverser vers un autre port (5 pièces)
  | "gare" // reçoit une carte Train
  | "boulot" // petit boulot : roue de 1 à 10 pièces
  | "surprise" // un événement au hasard
  | "unvstous"; // mini-jeu un contre tous

export interface GlobeSpace {
  id: number;
  kind: SpaceKind;
  /** Position sur la carte (0 à 1000 × 0 à 560). */
  x: number;
  y: number;
  /** Destination (indice dans DESTINATIONS). */
  destination?: number;
  /** Cases voisines (le réseau de chemins, avec ses embranchements). */
  next: number[];
}

export interface Destination {
  name: string;
  flag: string;
  /** Trois photos possibles : gastronomie, monument, shopping. */
  photos: [string, string, string];
}

export const DESTINATIONS: Destination[] = [
  { name: "Italie", flag: "🇮🇹", photos: ["Pizza napolitaine", "Colisée", "Marché de Florence"] },
  { name: "Maroc", flag: "🇲🇦", photos: ["Tajine", "Désert du Sahara", "Souk de Marrakech"] },
  { name: "Égypte", flag: "🇪🇬", photos: ["Koshari", "Pyramides", "Bazar du Caire"] },
  { name: "Madagascar", flag: "🇲🇬", photos: ["Romazava", "Allée des baobabs", "Vanille"] },
  { name: "Inde", flag: "🇮🇳", photos: ["Curry", "Taj Mahal", "Saris colorés"] },
  { name: "Singapour", flag: "🇸🇬", photos: ["Crabe au piment", "Jardins de la baie", "Centre commercial"] },
  { name: "Japon", flag: "🇯🇵", photos: ["Sushis", "Mont Fuji", "Akihabara"] },
  { name: "Australie", flag: "🇦🇺", photos: ["Barbecue", "Opéra de Sydney", "Boomerang"] },
  { name: "Brésil", flag: "🇧🇷", photos: ["Feijoada", "Christ Rédempteur", "Carnaval"] },
  { name: "Mexique", flag: "🇲🇽", photos: ["Tacos", "Pyramide maya", "Sombreros"] },
  { name: "États-Unis", flag: "🇺🇸", photos: ["Hamburger", "Grand Canyon", "Times Square"] },
  { name: "Canada", flag: "🇨🇦", photos: ["Sirop d'érable", "Chutes du Niagara", "Chemises à carreaux"] },
];

/** Étapes du tour : départ (France), puis chaque destination dans l'ordre, et retour. */
const WAYPOINTS: { x: number; y: number; destination?: number; between: string[] }[] = [
  { x: 480, y: 100, between: ["aeroport", "boulot"] }, // Départ : Paris
  { x: 600, y: 120, destination: 0, between: ["surprise", "gare"] },
  { x: 430, y: 215, destination: 1, between: ["boutique", "unvstous"] },
  { x: 600, y: 232, destination: 2, between: ["boulot", "port", "surprise"] },
  { x: 650, y: 425, destination: 3, between: ["gare", "unvstous"] },
  { x: 730, y: 250, destination: 4, between: ["aeroport", "boulot"] },
  { x: 810, y: 330, destination: 5, between: ["surprise", "boutique"] },
  { x: 935, y: 150, destination: 6, between: ["gare", "boulot", "unvstous"] },
  { x: 885, y: 445, destination: 7, between: ["port", "surprise", "boulot", "gare"] },
  { x: 370, y: 405, destination: 8, between: ["boutique", "surprise"] },
  { x: 220, y: 285, destination: 9, between: ["aeroport", "unvstous"] },
  { x: 120, y: 170, destination: 10, between: ["boulot", "surprise"] },
  { x: 300, y: 90, destination: 11, between: ["port", "boutique", "boulot"] },
];

/** Points de passage du trajet entre deux étapes (route du Sud entre l'Australie et le Brésil, Atlantique Nord au retour). */
const DETOURS: Record<number, { x: number; y: number }[]> = {
  8: [{ x: 975, y: 290 }],
  9: [{ x: 830, y: 520 }, { x: 570, y: 535 }, { x: 430, y: 490 }],
  0: [{ x: 390, y: 45 }],
};

/**
 * Raccourcis : des chemins de traverse entre deux étapes du tour (indice de l'étape dans
 * WAYPOINTS), avec les cases qui les jalonnent. Ils créent les embranchements du réseau.
 */
const SHORTCUTS: { from: number; to: number; kinds: SpaceKind[]; via?: { x: number; y: number } }[] = [
  { from: 1, to: 3, kinds: ["boulot", "surprise"], via: { x: 680, y: 170 } }, // Méditerranée : Italie → Égypte
  { from: 2, to: 9, kinds: ["port", "surprise", "boulot", "unvstous"], via: { x: 380, y: 310 } }, // Atlantique Sud : Maroc → Brésil
  { from: 5, to: 7, kinds: ["gare", "surprise", "boutique"], via: { x: 780, y: 150 } }, // Chine : Inde → Japon
  { from: 6, to: 8, kinds: ["boulot", "gare"], via: { x: 830, y: 410 } }, // Singapour → Australie
  { from: 10, to: 12, kinds: ["surprise", "gare"], via: { x: 290, y: 200 } }, // Mexique → Canada
  { from: 4, to: 6, kinds: ["unvstous", "surprise", "boulot"], via: { x: 730, y: 395 } }, // Océan Indien : Madagascar → Singapour
];

function buildMap(): GlobeSpace[] {
  const spaces: GlobeSpace[] = [];
  const stops: number[] = [];
  const link = (a: number, b: number) => {
    if (!spaces[a]!.next.includes(b)) spaces[a]!.next.push(b);
    if (!spaces[b]!.next.includes(a)) spaces[b]!.next.push(a);
  };
  /** Ajoute des cases le long d'un trajet (avec détours) et renvoie leurs indices. */
  const along = (path: { x: number; y: number }[], kinds: SpaceKind[]): number[] => {
    const lengths = path.slice(1).map((p, k) => Math.hypot(p.x - path[k]!.x, p.y - path[k]!.y));
    const total = lengths.reduce((a, b) => a + b, 0);
    return kinds.map((kind, k) => {
      let d = ((k + 1) / (kinds.length + 1)) * total;
      let seg = 0;
      while (seg < lengths.length - 1 && d > lengths[seg]!) d -= lengths[seg++]!;
      const a = path[seg]!;
      const b = path[seg + 1]!;
      const t = d / lengths[seg]!;
      spaces.push({ id: spaces.length, kind, x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t), next: [] });
      return spaces.length - 1;
    });
  };
  // Le grand tour : départ, destinations et cases entre elles.
  const between: number[][] = [];
  WAYPOINTS.forEach((w, i) => {
    stops.push(spaces.length);
    spaces.push({ id: spaces.length, kind: i === 0 ? "depart" : "destination", x: w.x, y: w.y, destination: w.destination, next: [] });
    const next = WAYPOINTS[(i + 1) % WAYPOINTS.length]!;
    between.push(along([{ x: w.x, y: w.y }, ...(DETOURS[(i + 1) % WAYPOINTS.length] ?? []), { x: next.x, y: next.y }], w.between as SpaceKind[]));
  });
  WAYPOINTS.forEach((_, i) => {
    const chain = [stops[i]!, ...between[i]!, stops[(i + 1) % WAYPOINTS.length]!];
    for (let k = 0; k < chain.length - 1; k++) link(chain[k]!, chain[k + 1]!);
  });
  // Les chemins de traverse.
  for (const sc of SHORTCUTS) {
    const a = spaces[stops[sc.from]!]!;
    const b = spaces[stops[sc.to]!]!;
    const ids = along([{ x: a.x, y: a.y }, ...(sc.via ? [sc.via] : []), { x: b.x, y: b.y }], sc.kinds);
    const chain = [a.id, ...ids, b.id];
    for (let k = 0; k < chain.length - 1; k++) link(chain[k]!, chain[k + 1]!);
  }
  return spaces;
}

export const GLOBE_MAP: GlobeSpace[] = buildMap();
export const GLOBE_SIZE = GLOBE_MAP.length;

/** Distance (en cases) de `from` à toutes les cases. */
export function globeDistances(from: number, map: GlobeSpace[] = GLOBE_MAP): number[] {
  const dist = map.map(() => Infinity);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const a = queue.shift()!;
    for (const b of map[a]!.next) if (dist[b] === Infinity) (dist[b] = dist[a]! + 1), queue.push(b);
  }
  return dist;
}

/**
 * Cases d'arrivée possibles en avançant d'exactement `steps` cases (sans repasser par une case),
 * avec un chemin pour chacune.
 */
export function globeReachable(from: number, steps: number, map: GlobeSpace[] = GLOBE_MAP): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const walk = (at: number, path: number[]) => {
    if (path.length === steps) {
      if (!out.has(at)) out.set(at, path);
      return;
    }
    for (const n of map[at]!.next) if (n !== from && !path.includes(n)) walk(n, [...path, n]);
  };
  walk(from, []);
  // Impasse (aucun chemin assez long) : on va le plus loin possible.
  if (!out.size && steps > 1) return globeReachable(from, steps - 1, map);
  return out;
}

export type CardKind = "train" | "taxi" | "helico" | "avion" | "montgolfiere" | "super";

export interface TravelCard {
  kind: CardKind;
  /** Cases parcourues (Train : 4, 5 ou 6 ; Hélico : 8). */
  value?: number;
}

export const CARD_INFO: Record<CardKind, { label: string; icon: string; price: number; help: string }> = {
  train: { label: "Train", icon: "🚆", price: 5, help: "Avance du nombre de cases indiqué" },
  taxi: { label: "Taxi", icon: "🚕", price: 10, help: "Avance de 1, 2 ou 3 cases, au choix" },
  helico: { label: "Hélico", icon: "🚁", price: 10, help: "Avance de 8 cases" },
  avion: { label: "Avion", icon: "✈️", price: 10, help: "S'envole vers l'aéroport de ton choix" },
  montgolfiere: { label: "Montgolfière", icon: "🎈", price: 5, help: "Une roue choisit de 3 à 8 cases" },
  super: { label: "Super voyage", icon: "🌟", price: 20, help: "Va directement à une destination à la une" },
};

export function cardLabel(card: TravelCard): string {
  return card.value && card.kind === "train" ? `${CARD_INFO.train.label} ${card.value}` : CARD_INFO[card.kind].label;
}

export const GLOBE_HAND_MAX = 4;
/** Cartes face cachée dans la rangée commune, et leurs valeurs possibles. */
export const GLOBE_ROW = 5;
export const ROW_VALUES = [1, 1, 2, 2, 3, 3, 4, 4, 5, 6];
export const GLOBE_START_COINS = 10;
export const PHOTO_PRICE = 10;
export const TRAVEL_FEE = 5;
export const GLOBE_ROUND_CHOICES = [6, 10, 15] as const;
/** Pièces gagnées au mini-jeu de début de tour, selon la place. */
export const ORDER_COINS = [10, 5, 3, 1];

export type SurpriseKind = "collecte" | "cadeaux" | "partage" | "voleur" | "tornade" | "ovni" | "billet" | "malle";

export const SURPRISES: Record<SurpriseKind, { label: string; text: string; fromRound?: number }> = {
  collecte: { label: "Collecte", text: "Un joueur au hasard te donne 5 pièces." },
  cadeaux: { label: "Cadeaux", text: "Chaque adversaire t'offre de 1 à 6 pièces." },
  partage: { label: "Partage", text: "Toutes les pièces sont partagées équitablement !", fromRound: 7 },
  voleur: { label: "Voleur", text: "Tu voles une carte à un adversaire." },
  tornade: { label: "Tornade", text: "Tu échanges ta place avec un adversaire." },
  ovni: { label: "OVNI", text: "Un OVNI te dépose sur une case au hasard." },
  billet: { label: "Billet gratuit", text: "Tu reçois une carte de transport." },
  malle: { label: "Valise perdue", text: "Tu perds 5 pièces." },
};

export interface GlobePhoto {
  destination: number;
  photo: number;
}

/** Ce que le joueur doit décider pendant son tour. */
export type GlobeChoice =
  | { type: "card" } // retourner une carte de la rangée, ou jouer une carte de transport
  | { type: "move"; steps: number; options: number[] } // choisir la case d'arrivée
  | { type: "airport"; options: number[]; fee: number } // s'envoler vers une case (ou rester)
  | { type: "port"; options: number[]; fee: number }
  | { type: "shop"; offers: TravelCard[] } // acheter une carte (ou passer)
  | { type: "super"; options: number[] }; // destination à la une à rejoindre

export interface GlobeTurn {
  playerId: string;
  choice: GlobeChoice | null;
  /** Message du dernier événement (déplacement, achat, surprise…). */
  text: string | null;
  /** Déplacement en cours, pour l'animation : cases traversées. */
  path: number[];
  moveId: number;
  /** Carte de la rangée retournée ce tour-ci. */
  reveal?: { slot: number; value: number };
  /** Roue (montgolfière, petit boulot) : valeur tirée. */
  spin?: { kind: "montgolfiere" | "boulot"; value: number; id: number };
  endsAt: number | null;
}

export interface GlobeState {
  map: GlobeSpace[];
  positions: Record<string, number>;
  coins: Record<string, number>;
  hands: Record<string, TravelCard[]>;
  photos: Record<string, GlobePhoto[]>;
  /** Destinations à la une (indices de cases) et photo proposée pour chacune. */
  hotspots: { space: number; photo: number }[];
  /** Rangée commune de cartes face cachée (seul leur nombre est connu). */
  row: number;
  /** Numéro du voyage à thème en cours (change quand ses 3 destinations sont visitées). */
  trip: number;
  order: string[];
  turn: GlobeTurn | null;
  round: number;
  rounds: number;
  overtime: number;
}
