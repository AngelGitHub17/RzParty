import { MAX_NAME_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants.ts";

/** Met un code saisi au propre : majuscules, sans espaces. */
export function normalizeRoomCode(input: unknown): string {
  return typeof input === "string" ? input.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

/**
 * Nettoie un pseudo : espaces superflus retirés, caractères de contrôle supprimés, longueur limitée.
 * Renvoie une chaîne vide si rien d'exploitable ne reste.
 */
export function sanitizeName(input: unknown): string {
  if (typeof input !== "string") return "";
  const cleaned = input
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...cleaned].slice(0, MAX_NAME_LENGTH).join("");
}
