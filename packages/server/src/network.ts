import { BlockList, isIP } from "node:net";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { config } from "./config.ts";

/**
 * Adresses IPv4 du PC sur le réseau local, la plus probable en premier
 * (box domestique 192.168.x.x, puis 10.x.x.x, puis 172.16-31.x.x).
 * Les adaptateurs virtuels (VirtualBox, WSL, Hyper-V, VPN) passent en dernier.
 */
export function lanAddresses(): string[] {
  const found: { address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      found.push({ address: info.address, score: score(name, info.address) });
    }
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.address);
}

function score(interfaceName: string, address: string): number {
  let s = 0;
  if (address.startsWith("192.168.")) s += 30;
  else if (address.startsWith("10.")) s += 20;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) s += 10;
  if (address.startsWith("169.254.")) s -= 50;
  if (/virtual|vbox|vmware|vethernet|wsl|hyper-v|docker|tailscale|zerotier|vpn|loopback/i.test(interfaceName)) s -= 40;
  if (/wi-?fi|wlan|ethernet|eth\d|en\d/i.test(interfaceName)) s += 5;
  return s;
}

/**
 * Adresse IP du joueur. Derrière un proxy (RZ_TRUST_PROXY=1), c'est la dernière entrée
 * de X-Forwarded-For : celle ajoutée par le proxy, qu'un visiteur ne peut pas falsifier.
 */
export function clientAddress(socket: { handshake: { address: string; headers: Record<string, string | string[] | undefined> } }): string {
  const direct = socket.handshake.address.replace(/^::ffff:/, "");
  if (!config.trustProxy) return direct;
  const header = socket.handshake.headers["x-forwarded-for"];
  const raw = Array.isArray(header) ? header.join(",") : header;
  const last = raw?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last ? last.replace(/^::ffff:/, "") : direct;
}

/** Adresse d'un réseau privé (box, réseau local) : jamais une adresse Internet. */
export function isPrivateAddress(address: string): boolean {
  if (/^(127\.|10\.|192\.168\.)/.test(address)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return true;
  if (address === "::1" || /^f[cd][0-9a-f]{2}:/i.test(address) || /^fe80:/i.test(address)) return true;
  return false;
}

/**
 * Vrai si l'adresse est sur un des réseaux du serveur (même sous-réseau qu'une de ses cartes, IPv4 ou IPv6).
 * Couvre le cas d'une box qui donne des adresses IPv6 publiques aux appareils de la maison :
 * elles ne sont pas « privées », mais sont bien sur le même réseau local que le serveur.
 */
export function onServerNetwork(address: string, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): boolean {
  const family = isIP(address);
  if (!family) return false;
  const list = new BlockList();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (info.internal || !info.cidr) continue;
      const [net, prefix] = info.cidr.split("/");
      // Lien local IPv6 (fe80::/10) : commun à tous les réseaux, on s'en tient à l'adresse exacte.
      if (info.family === "IPv6" && /^fe80:/i.test(info.address)) continue;
      list.addSubnet(net!, Number(prefix), info.family === "IPv6" ? "ipv6" : "ipv4");
    }
  }
  return list.check(address, family === 6 ? "ipv6" : "ipv4");
}

/** Le client passe-t-il par un proxy que l'on ne connaît pas ? (alors on ne peut pas se fier à son adresse) */
export function viaUnknownProxy(headers: Record<string, string | string[] | undefined>): boolean {
  return !config.trustProxy && Boolean(headers["x-forwarded-for"] || headers["forwarded"] || headers["x-real-ip"]);
}
