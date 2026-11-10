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

describe("règles des pseudos", () => {
  it("accepte les prénoms ordinaires et refuse insultes, liens et noms réservés", async () => {
    const { nameProblem } = await import("@rzparty/shared");
    for (const n of ["Léa", "Constance", "Dominique", "Killian", "Violette", "Nazim", "Jean-Michel", "O'Neil", "Mathéo_92", "Cassandre", "Computer"]) expect(nameProblem(n), n).toBeNull();
    for (const n of ["connard", "C0nn4rd", "merrrde", "Le con", "p u t a i n", "admin", "Hôte", "www.site.fr", "a", "123", "bob@mail", "N1que", "aaaaaab", "0612345678"]) expect(nameProblem(n), n).not.toBeNull();
  });
});
