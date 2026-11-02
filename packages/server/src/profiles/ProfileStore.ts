import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ERRORS,
  emptyStats,
  normalizeAvatar,
  sanitizeName,
  type Avatar,
  type ProfileAccess,
  type ProfileStats,
  type PublicProfile,
} from "@rzparty/shared";
import { RoomError } from "../rooms/RoomManager.ts";

/** Profil tel qu'il est enregistré sur le disque du PC hôte. */
interface StoredProfile {
  id: string;
  name: string;
  avatar: Avatar;
  /** PIN haché (scrypt + sel), jamais en clair. */
  pin: { salt: string; hash: string } | null;
  /** Empreintes (SHA-256) des jetons des appareils autorisés, les plus récents en dernier. */
  tokens: string[];
  stats: ProfileStats;
  createdAt: number;
  lastSeenAt: number;
  /** Vrai si la sauvegarde a été modifiée à la main : le joueur sera prévenu à sa prochaine connexion. */
  tampered: boolean;
  /** Signature HMAC du reste de la fiche : détecte toute modification manuelle du fichier. */
  sig: string;
}

interface StoreFile {
  version: 1;
  profiles: StoredProfile[];
}

export interface RecordDefinition {
  key: string;
  better: "lower" | "higher";
}

const MAX_TOKENS = 12;
const MAX_PIN_FAILS = 5;
const PIN_LOCK_MS = 30_000;

/** JSON aux clés triées : même contenu = même texte = même signature. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Profils des joueurs, enregistrés dans `data/profiles.json` sur le PC hôte.
 * Chaque fiche est signée avec une clé propre à ce PC (`data/secret.key`) : une fiche modifiée
 * à la main est détectée au chargement, ses statistiques sont effacées (« Bien essayé… »).
 */
export class ProfileStore {
  private profiles = new Map<string, StoredProfile>();
  private secret: Buffer;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pinFails = new Map<string, { count: number; lockedUntil: number }>();
  private readonly file: string;
  /** Prévenu à chaque changement de la liste (création, modification, suppression). */
  onChange: (profile: PublicProfile | null, removedId?: string) => void = () => {};

  constructor(
    private readonly dir: string,
    private readonly opts: { now?: () => number; log?: (...parts: unknown[]) => void; saveDelayMs?: number } = {},
  ) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "profiles.json");
    this.secret = this.loadSecret();
    this.load();
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private log(...parts: unknown[]): void {
    (this.opts.log ?? console.log)(...parts);
  }

  // ───────────── Lecture ─────────────

  list(): PublicProfile[] {
    return [...this.profiles.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt).map(toPublic);
  }

  get(id: string): PublicProfile | undefined {
    const p = this.profiles.get(id);
    return p ? toPublic(p) : undefined;
  }

  /** Profil portant ce pseudo (sans tenir compte des majuscules), pour l'écran « Qui joue ? ». */
  findByName(raw: unknown): { id: string; name: string; avatar: Avatar; hasPin: boolean } {
    const name = sanitizeName(raw).toLocaleLowerCase("fr");
    for (const p of this.profiles.values()) {
      if (name && p.name.toLocaleLowerCase("fr") === name) return { id: p.id, name: p.name, avatar: { ...p.avatar }, hasPin: p.pin !== null };
    }
    throw new RoomError(ERRORS.noProfileWithName);
  }

  /** Profil correspondant à un jeton d'appareil, ou erreur si le jeton n'est plus valable. */
  byToken(token: unknown): PublicProfile {
    return toPublic(this.requireToken(token));
  }

  // ───────────── Joueurs ─────────────

  create(rawName: unknown, rawAvatar: unknown, rawPin?: unknown): ProfileAccess {
    const name = this.requireFreeName(rawName);
    const pin = rawPin === undefined || rawPin === null || rawPin === "" ? null : this.hashPin(rawPin);
    const now = this.now();
    const profile: StoredProfile = {
      id: randomBytes(6).toString("base64url"),
      name,
      avatar: normalizeAvatar(rawAvatar),
      pin,
      tokens: [],
      stats: emptyStats(),
      createdAt: now,
      lastSeenAt: now,
      tampered: false,
      sig: "",
    };
    const token = this.issueToken(profile);
    this.put(profile);
    return { profile: toPublic(profile), token, tampered: false };
  }

  unlock(profileId: unknown, rawPin?: unknown): ProfileAccess {
    const profile = typeof profileId === "string" ? this.profiles.get(profileId) : undefined;
    if (!profile) throw new RoomError(ERRORS.profileNotFound);

    if (profile.pin) {
      const fails = this.pinFails.get(profile.id);
      if (fails && fails.lockedUntil > this.now()) throw new RoomError(ERRORS.pinLocked);
      if (rawPin === undefined || rawPin === null || rawPin === "") throw new RoomError(ERRORS.profileLocked);
      if (typeof rawPin !== "string" || !this.checkPin(profile.pin, rawPin)) {
        const count = (fails?.count ?? 0) + 1;
        const locked = count >= MAX_PIN_FAILS;
        this.pinFails.set(profile.id, { count: locked ? 0 : count, lockedUntil: locked ? this.now() + PIN_LOCK_MS : 0 });
        throw new RoomError(locked ? ERRORS.pinLocked : ERRORS.wrongPin);
      }
      this.pinFails.delete(profile.id);
    }

    const tampered = profile.tampered;
    profile.tampered = false;
    profile.lastSeenAt = this.now();
    const token = this.issueToken(profile);
    this.put(profile);
    return { profile: toPublic(profile), token, tampered };
  }

  update(token: unknown, patch: { name?: unknown; avatar?: unknown; pin?: unknown }): PublicProfile {
    const profile = this.requireToken(token);
    if (patch.name !== undefined) profile.name = this.requireFreeName(patch.name, profile.id);
    if (patch.avatar !== undefined) profile.avatar = normalizeAvatar(patch.avatar);
    if (patch.pin === null || patch.pin === "") profile.pin = null;
    else if (patch.pin !== undefined) profile.pin = this.hashPin(patch.pin);
    this.put(profile);
    return toPublic(profile);
  }

  /** Marque un profil comme utilisé (il remonte en tête de liste). */
  touch(profileId: string): void {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    profile.lastSeenAt = this.now();
    this.put(profile, { quiet: true });
  }

  // ───────────── Statistiques ─────────────

  recordRound(profileId: string, info: { miniGameId: string; won: boolean; records: Record<string, number>; definitions: RecordDefinition[] }): void {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    const s = profile.stats;
    s.roundsPlayed++;
    if (info.won) s.roundsWon++;
    const game = (s.perGame[info.miniGameId] ??= { played: 0, won: 0 });
    game.played++;
    if (info.won) game.won++;
    for (const def of info.definitions) {
      const value = info.records[def.key];
      if (value === undefined) continue;
      const key = `${info.miniGameId}.${def.key}`;
      const previous = s.records[key];
      const better = previous === undefined || (def.better === "lower" ? value < previous : value > previous);
      if (better) s.records[key] = value;
    }
    this.put(profile, { quiet: true });
  }

  recordGame(profileId: string, won: boolean): void {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    profile.stats.gamesPlayed++;
    if (won) profile.stats.gamesWon++;
    this.put(profile);
  }

  // ───────────── Hôte ─────────────

  rename(profileId: unknown, rawName: unknown): void {
    const profile = this.requireId(profileId);
    profile.name = this.requireFreeName(rawName, profile.id);
    this.put(profile);
  }

  clearPin(profileId: unknown): void {
    const profile = this.requireId(profileId);
    profile.pin = null;
    this.pinFails.delete(profile.id);
    this.put(profile);
  }

  resetStats(profileId: unknown): void {
    const profile = this.requireId(profileId);
    profile.stats = emptyStats();
    this.put(profile);
  }

  delete(profileId: unknown): void {
    const profile = this.requireId(profileId);
    this.profiles.delete(profile.id);
    this.scheduleSave();
    this.onChange(null, profile.id);
  }

  /** Écrit immédiatement les changements en attente (arrêt du serveur). */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.save();
  }

  // ───────────── Interne ─────────────

  private put(profile: StoredProfile, opts: { quiet?: boolean } = {}): void {
    profile.sig = this.sign(profile);
    this.profiles.set(profile.id, profile);
    this.scheduleSave();
    if (!opts.quiet) this.onChange(toPublic(profile));
  }

  private sign(profile: StoredProfile): string {
    const { sig: _sig, ...rest } = profile;
    return createHmac("sha256", this.secret).update(canonical(rest)).digest("hex");
  }

  private issueToken(profile: StoredProfile): string {
    const token = randomBytes(24).toString("base64url");
    profile.tokens = [...profile.tokens, sha256(token)].slice(-MAX_TOKENS);
    return token;
  }

  private requireToken(token: unknown): StoredProfile {
    if (typeof token === "string" && token) {
      const digest = sha256(token);
      for (const p of this.profiles.values()) if (p.tokens.includes(digest)) return p;
    }
    throw new RoomError(ERRORS.profileNotFound);
  }

  private requireId(profileId: unknown): StoredProfile {
    const profile = typeof profileId === "string" ? this.profiles.get(profileId) : undefined;
    if (!profile) throw new RoomError(ERRORS.profileNotFound);
    return profile;
  }

  private requireFreeName(raw: unknown, exceptId?: string): string {
    const name = sanitizeName(raw);
    if (!name) throw new RoomError(ERRORS.nameRequired);
    const lower = name.toLocaleLowerCase("fr");
    for (const p of this.profiles.values()) {
      if (p.id !== exceptId && p.name.toLocaleLowerCase("fr") === lower) throw new RoomError(ERRORS.nameTaken);
    }
    return name;
  }

  private hashPin(raw: unknown): { salt: string; hash: string } {
    if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) throw new RoomError(ERRORS.invalidPin);
    const salt = randomBytes(16).toString("hex");
    return { salt, hash: scryptSync(raw, salt, 32).toString("hex") };
  }

  private checkPin(stored: { salt: string; hash: string }, pin: string): boolean {
    const expected = Buffer.from(stored.hash, "hex");
    const actual = scryptSync(pin, stored.salt, 32);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private loadSecret(): Buffer {
    const path = join(this.dir, "secret.key");
    if (existsSync(path)) {
      const hex = readFileSync(path, "utf8").trim();
      if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, "hex");
    }
    const secret = randomBytes(32);
    writeFileSync(path, secret.toString("hex"), "utf8");
    return secret;
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    let data: StoreFile;
    try {
      data = JSON.parse(readFileSync(this.file, "utf8")) as StoreFile;
      if (!Array.isArray(data.profiles)) throw new Error("format inattendu");
    } catch (err) {
      const backup = join(this.dir, `profiles.illisible-${this.now()}.json`);
      renameSync(this.file, backup);
      this.log(`  Le fichier des profils était illisible (${(err as Error).message}). Copie gardée dans ${backup}.`);
      return;
    }

    let tamperedCount = 0;
    for (const raw of data.profiles) {
      if (!raw || typeof raw.id !== "string") continue;
      const profile: StoredProfile = {
        id: raw.id,
        name: sanitizeName(raw.name) || "Joueur",
        avatar: normalizeAvatar(raw.avatar),
        pin: raw.pin && typeof raw.pin.salt === "string" && typeof raw.pin.hash === "string" ? raw.pin : null,
        tokens: Array.isArray(raw.tokens) ? raw.tokens.filter((t) => typeof t === "string") : [],
        stats: { ...emptyStats(), ...(raw.stats ?? {}) },
        createdAt: Number(raw.createdAt) || this.now(),
        lastSeenAt: Number(raw.lastSeenAt) || this.now(),
        tampered: Boolean(raw.tampered),
        sig: typeof raw.sig === "string" ? raw.sig : "",
      };
      // Toute fiche dont la signature ne correspond plus a été modifiée à la main.
      const valid = typeof raw.sig === "string" && raw.sig === this.sign({ ...raw, sig: "" } as StoredProfile);
      if (!valid) {
        tamperedCount++;
        this.log(`  Profil « ${profile.name} » modifié à la main : bien essayé, sauvegarde effacée.`);
        profile.stats = emptyStats();
        profile.tampered = true;
      }
      profile.sig = this.sign(profile);
      this.profiles.set(profile.id, profile);
    }
    if (tamperedCount) this.save();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, this.opts.saveDelayMs ?? 300);
  }

  private save(): void {
    const data: StoreFile = { version: 1, profiles: [...this.profiles.values()] };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    renameSync(tmp, this.file);
  }
}

function toPublic(p: StoredProfile): PublicProfile {
  return {
    id: p.id,
    name: p.name,
    avatar: { ...p.avatar },
    hasPin: p.pin !== null,
    stats: structuredClone(p.stats),
    createdAt: p.createdAt,
    lastSeenAt: p.lastSeenAt,
  };
}
