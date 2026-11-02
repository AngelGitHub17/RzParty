import { socket } from "../net/connection.ts";

/**
 * Décalage entre l'horloge du serveur et celle de cet appareil.
 * Recalé à chaque état reçu : on garde l'estimation la plus haute des dernières secondes,
 * car un message n'arrive jamais avant d'être parti.
 */
let offset = 0;
let samples: { at: number; value: number }[] = [];

socket.on("room:state", (snapshot) => {
  const now = Date.now();
  samples.push({ at: now, value: snapshot.serverNow - now });
  samples = samples.filter((s) => now - s.at < 15_000);
  offset = Math.max(...samples.map((s) => s.value));
});

/** Heure du serveur estimée, en millisecondes. */
export function serverNow(): number {
  return Date.now() + offset;
}
