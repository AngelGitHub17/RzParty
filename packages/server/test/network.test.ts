import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "../src/network.ts";

describe("réseau", () => {
  it("reconnaît les adresses du réseau local", () => {
    for (const a of ["127.0.0.1", "192.168.1.20", "10.0.0.5", "172.16.3.4", "172.31.0.1", "::1", "fd12:3456::1"]) expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["8.8.8.8", "172.32.0.1", "82.64.10.3", "2a01:e0a::1"]) expect(isPrivateAddress(a), a).toBe(false);
  });
});
