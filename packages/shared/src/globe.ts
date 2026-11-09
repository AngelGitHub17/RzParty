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
  { x: 506, y: 128, between: ["aeroport", "boulot"] }, // Départ : Paris
  { x: 540, y: 158, destination: 0, between: ["surprise", "gare"] },
  { x: 478, y: 196, destination: 1, between: ["boutique", "unvstous"] },
  { x: 588, y: 214, destination: 2, between: ["boulot", "port", "surprise"] },
  { x: 636, y: 398, destination: 3, between: ["gare", "unvstous"] },
  { x: 716, y: 238, destination: 4, between: ["aeroport", "boulot"] },
  { x: 790, y: 318, destination: 5, between: ["surprise", "boutique"] },
  { x: 880, y: 182, destination: 6, between: ["gare", "boulot", "unvstous"] },
  { x: 872, y: 424, destination: 7, between: ["port", "surprise", "boulot", "gare"] },
  { x: 372, y: 382, destination: 8, between: ["boutique", "surprise"] },
  { x: 228, y: 248, destination: 9, between: ["aeroport", "unvstous"] },
  { x: 186, y: 172, destination: 10, between: ["boulot", "surprise"] },
  { x: 300, y: 140, destination: 11, between: ["port", "boutique", "boulot"] },
];

/** Points de passage du trajet entre deux étapes (route du Sud entre l'Australie et le Brésil, Atlantique Nord au retour). */
const DETOURS: Record<number, { x: number; y: number }[]> = {
  8: [{ x: 820, y: 500 }, { x: 560, y: 520 }, { x: 420, y: 470 }],
  12: [{ x: 400, y: 70 }],
};

function buildMap(): GlobeSpace[] {
  const spaces: GlobeSpace[] = [];
  WAYPOINTS.forEach((w, i) => {
    spaces.push({ id: spaces.length, kind: i === 0 ? "depart" : "destination", x: w.x, y: w.y, destination: w.destination });
    const next = WAYPOINTS[(i + 1) % WAYPOINTS.length]!;
    // Points intermédiaires répartis sur le trajet (avec détours éventuels).
    const path = [{ x: w.x, y: w.y }, ...(DETOURS[(i + 1) % WAYPOINTS.length] ?? []), { x: next.x, y: next.y }];
    const lengths = path.slice(1).map((p, k) => Math.hypot(p.x - path[k]!.x, p.y - path[k]!.y));
    const total = lengths.reduce((a, b) => a + b, 0);
    w.between.forEach((kind, k) => {
      let d = ((k + 1) / (w.between.length + 1)) * total;
      let seg = 0;
      while (seg < lengths.length - 1 && d > lengths[seg]!) d -= lengths[seg++]!;
      const a = path[seg]!;
      const b = path[seg + 1]!;
      const t = d / lengths[seg]!;
      spaces.push({ id: spaces.length, kind: kind as SpaceKind, x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) });
    });
  });
  return spaces;
}

export const GLOBE_MAP: GlobeSpace[] = buildMap();
export const GLOBE_SIZE = GLOBE_MAP.length;

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
  | { type: "card" } // jouer une carte (ou « À pied » si la main est vide)
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
  order: string[];
  turn: GlobeTurn | null;
  round: number;
  rounds: number;
  overtime: number;
}
