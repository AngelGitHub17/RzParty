import { describe, expect, it } from "vitest";
import { isValidRoomCode, normalizeRoomCode, sanitizeName } from "@rzparty/shared";

describe("validation partagée", () => {
  it("nettoie les pseudos", () => {
    expect(sanitizeName("  Jean   Michel ")).toBe("Jean Michel");
    expect(sanitizeName("a\u0000b​c")).toBe("abc");
    expect(sanitizeName("x".repeat(40))).toHaveLength(16);
    expect(sanitizeName(42)).toBe("");
  });

  it("normalise et valide les codes", () => {
    expect(normalizeRoomCode(" ab cd ")).toBe("ABCD");
    expect(isValidRoomCode("ABCD")).toBe(true);
    expect(isValidRoomCode("ABC")).toBe(false);
    expect(isValidRoomCode("AB0D")).toBe(false);
  });
});
