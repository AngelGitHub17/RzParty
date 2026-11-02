import { randomBytes, randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@rzparty/shared";

export function newPlayerId(): string {
  return randomBytes(6).toString("base64url");
}

/** Jeton secret qui permet à un joueur de reprendre sa place après une coupure. */
export function newToken(): string {
  return randomBytes(18).toString("base64url");
}

export function newRoomCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
  throw new Error("Impossible de générer un code de salon libre.");
}
