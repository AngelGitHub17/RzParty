import { io, type Socket } from "socket.io-client";
import type { Ack, ClientToServerEvents, ServerInfo, ServerToClientEvents } from "@rzparty/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Une seule connexion par onglet, vers le serveur qui a servi la page. */
export const socket: GameSocket = io({
  transports: ["websocket", "polling"],
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

/** Erreur renvoyée par le serveur ; son message est prêt à être affiché. */
export class ServerError extends Error {}

type EventsWithAck = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [...infer _A, (res: Ack<infer _T>) => void]
    ? K
    : never;
}[keyof ClientToServerEvents];

type PayloadOf<K extends EventsWithAck> = Parameters<ClientToServerEvents[K]> extends [infer P, unknown] ? P : undefined;
type ResultOf<K extends EventsWithAck> = Parameters<ClientToServerEvents[K]> extends [...unknown[], (res: Ack<infer T>) => void]
  ? T
  : never;

/**
 * Envoie une demande au serveur et attend sa réponse.
 * Lève une ServerError avec le message du serveur en cas de refus, ou si le serveur ne répond pas.
 */
export function request<K extends EventsWithAck>(
  event: K,
  ...payload: PayloadOf<K> extends undefined ? [] : [PayloadOf<K>]
): Promise<ResultOf<K>> {
  return new Promise((resolve, reject) => {
    const onAck = (err: Error | null, res?: Ack<ResultOf<K>>) => {
      if (err || !res) return reject(new ServerError("Le serveur ne répond pas. Vérifie que le PC hôte est allumé."));
      if (res.ok) resolve(res.data);
      else reject(new ServerError(res.error));
    };
    // Le cast est sûr : le type de l'événement garantit la forme de la charge utile.
    const timed = socket.timeout(6000) as unknown as {
      emit(event: string, ...args: unknown[]): void;
    };
    timed.emit(event, ...payload, onAck);
  });
}

export async function fetchServerInfo(): Promise<ServerInfo | undefined> {
  try {
    const res = await fetch("/api/info");
    return res.ok ? ((await res.json()) as ServerInfo) : undefined;
  } catch {
    return undefined;
  }
}

/** Adresse à donner aux autres appareils : le nom de domaine s'il existe, sinon l'IP du PC hôte sur le réseau local. */
export function lanOrigin(info: ServerInfo | undefined): string {
  if (info?.publicUrl) return info.publicUrl;
  const { protocol, hostname, port } = window.location;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const host = isLocal && info?.lanAddresses[0] ? info.lanAddresses[0] : hostname;
  return `${protocol}//${host}${port ? `:${port}` : ""}`;
}
