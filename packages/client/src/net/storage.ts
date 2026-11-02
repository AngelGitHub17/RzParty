import type { Seat } from "@rzparty/shared";

/**
 * Petites préférences locales (dernier pseudo, place dans un salon).
 * Le stockage peut être indisponible (navigation privée) : tout est protégé et facultatif.
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : on continue sans */
  }
}

export const storage = {
  get lastName(): string {
    return read("rz.lastName") ?? "";
  },
  set lastName(value: string) {
    write("rz.lastName", value);
  },

  get seat(): Seat | null {
    const raw = read("rz.seat");
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as Seat;
      return typeof s.code === "string" && typeof s.token === "string" && typeof s.playerId === "string" ? s : null;
    } catch {
      return null;
    }
  },
  set seat(value: Seat | null) {
    write("rz.seat", value ? JSON.stringify(value) : null);
  },

  /** Jetons des profils déjà ouverts sur cet appareil (évite de retaper le PIN). */
  get profileTokens(): Record<string, string> {
    try {
      const parsed = JSON.parse(read("rz.profiles") ?? "{}") as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  },
  rememberProfile(profileId: string, token: string): void {
    write("rz.profiles", JSON.stringify({ ...this.profileTokens, [profileId]: token }));
    write("rz.lastProfile", profileId);
  },
  forgetProfile(profileId: string): void {
    const tokens = this.profileTokens;
    delete tokens[profileId];
    write("rz.profiles", JSON.stringify(tokens));
    if (read("rz.lastProfile") === profileId) write("rz.lastProfile", null);
  },
  get lastProfileId(): string | null {
    return read("rz.lastProfile");
  },

  get screenCode(): string | null {
    return read("rz.screenCode");
  },
  set screenCode(value: string | null) {
    write("rz.screenCode", value);
  },
};
