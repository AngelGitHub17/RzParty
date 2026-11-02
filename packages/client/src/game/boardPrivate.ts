import type { ItemId } from "@rzparty/shared";
import { socket } from "../net/connection.ts";

/**
 * Objets du joueur de cet appareil (secrets : le serveur ne les envoie qu'à lui).
 * Gardés ici car ils peuvent arriver avant l'affichage du plateau (reconnexion).
 */
let items: ItemId[] = [];
const listeners = new Set<(items: ItemId[]) => void>();

socket.on("board:private", (data) => {
  items = Array.isArray(data?.items) ? data.items : [];
  for (const fn of listeners) fn(items);
});
socket.on("room:state", (room) => {
  // Nouvelle partie ou retour au salon : on oublie les objets de la partie précédente.
  if (!room.game?.board && items.length) items = [];
});

export function myItems(): ItemId[] {
  return items;
}

export function onMyItems(fn: (items: ItemId[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
