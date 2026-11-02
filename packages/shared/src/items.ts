/**
 * Objets du mode Plateau : achetés dans les boutiques, utilisés avant de lancer le dé.
 * Pour ajouter un objet : une entrée ici, puis son effet dans le mode Plateau (serveur).
 */
export type ItemId = "de-pipe" | "de-12" | "aimant" | "brouilleur";

export interface ItemInfo {
  id: ItemId;
  name: string;
  price: number;
  /** Symbole court affiché sur le bouton. */
  icon: string;
  help: string;
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  "de-pipe": { id: "de-pipe", name: "Dé pipé", price: 12, icon: "🎯", help: "Tu choisis le résultat de ton dé (de 1 à 6)." },
  "de-12": { id: "de-12", name: "Dé à 12 faces", price: 8, icon: "🎲", help: "Ton dé normal est remplacé par un dé à 12 faces pour ce lancer." },
  aimant: {
    id: "aimant",
    name: "Aimant à pièces",
    price: 10,
    icon: "🧲",
    help: "3 chances sur 4 : tu voles 3 à 10 pièces à chaque adversaire. 1 sur 4 : retour de flamme, tu perds 1 à 5 pièces, partagées entre les autres.",
  },
  brouilleur: { id: "brouilleur", name: "Brouilleur", price: 6, icon: "📡", help: "Pièces, places et cases restantes de tout le monde sont cachées pendant 2 tours." },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Nombre d'objets qu'un joueur peut porter en même temps (par défaut ; réglable en plateau personnalisé). */
export const MAX_ITEMS = 2;

/** Nombre de tours de plateau pendant lesquels le Brouilleur cache les informations. */
export const SCRAMBLE_ROUNDS = 2;

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && value in ITEMS;
}
