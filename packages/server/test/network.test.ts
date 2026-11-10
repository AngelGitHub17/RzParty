import { describe, expect, it } from "vitest";
import { isPrivateAddress, onServerNetwork } from "../src/network.ts";

describe("réseau", () => {
  it("reconnaît les adresses du réseau local", () => {
    for (const a of ["127.0.0.1", "192.168.1.20", "10.0.0.5", "172.16.3.4", "172.31.0.1", "::1", "fd12:3456::1"]) expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["8.8.8.8", "172.32.0.1", "82.64.10.3", "2a01:e0a::1"]) expect(isPrivateAddress(a), a).toBe(false);
  });

  it("reconnaît le réseau du serveur, IPv6 de la box compris", () => {
    const cards = {
      eth0: [
        { address: "192.168.1.50", netmask: "255.255.255.0", family: "IPv4", mac: "", internal: false, cidr: "192.168.1.50/24" },
        { address: "2a01:e0a:1:2::50", netmask: "ffff:ffff:ffff:ffff::", family: "IPv6", mac: "", internal: false, cidr: "2a01:e0a:1:2::50/64", scopeid: 0 },
        { address: "fe80::1", netmask: "ffff:ffff:ffff:ffff::", family: "IPv6", mac: "", internal: false, cidr: "fe80::1/64", scopeid: 2 },
      ],
      lo: [{ address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4", mac: "", internal: true, cidr: "127.0.0.1/8" }],
    } as never;
    expect(onServerNetwork("192.168.1.23", cards)).toBe(true);
    expect(onServerNetwork("2a01:e0a:1:2:abcd::9", cards)).toBe(true);
    expect(onServerNetwork("192.168.2.23", cards)).toBe(false);
    expect(onServerNetwork("2a01:e0a:9:9::1", cards)).toBe(false);
    expect(onServerNetwork("8.8.8.8", cards)).toBe(false);
    expect(onServerNetwork("pas une adresse", cards)).toBe(false);
  });
});
