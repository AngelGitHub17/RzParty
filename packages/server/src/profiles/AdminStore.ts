import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ERRORS, sanitizeName } from "@rzparty/shared";
import { RoomError } from "../rooms/RoomManager.ts";

interface AdminFile {
  login: string;
  salt: string;
  hash: string;
}

const SESSION_MS = 12 * 60 * 60_000;
const MAX_FAILS = 5;
const LOCK_MS = 30_000;
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Compte de l'hôte pour la page /hote : un identifiant et un mot de passe, créés au premier accès.
 * Enregistré dans `data/admin.json` (mot de passe haché). Pour le réinitialiser en cas d'oubli,
 * il suffit de supprimer ce fichier sur le PC hôte.
 */
export class AdminStore {
  private account: AdminFile | null = null;
  private sessions = new Map<string, number>();
  private fails = { count: 0, lockedUntil: 0 };
  private readonly file: string;

  constructor(dir: string, private readonly now: () => number = Date.now) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "admin.json");
    try {
      if (existsSync(this.file)) {
        const data = JSON.parse(readFileSync(this.file, "utf8")) as AdminFile;
        if (typeof data.login === "string" && typeof data.salt === "string" && typeof data.hash === "string") this.account = data;
      }
    } catch {
      this.account = null;
    }
  }

  get configured(): boolean {
    return this.account !== null;
  }

  /** Premier accès : crée le compte de l'hôte et ouvre une session. */
  setup(rawLogin: unknown, rawPassword: unknown): string {
    if (this.account) throw new RoomError(ERRORS.adminExists);
    const login = sanitizeName(rawLogin);
    if (!login) throw new RoomError(ERRORS.adminLoginRequired);
    if (typeof rawPassword !== "string" || rawPassword.length < MIN_PASSWORD_LENGTH) throw new RoomError(ERRORS.adminPasswordShort);
    const salt = randomBytes(16).toString("hex");
    this.account = { login, salt, hash: scryptSync(rawPassword, salt, 32).toString("hex") };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.account, null, 2)}\n`, "utf8");
    renameSync(tmp, this.file);
    return this.openSession();
  }

  login(rawLogin: unknown, rawPassword: unknown): string {
    if (!this.account) throw new RoomError(ERRORS.adminNotSetUp);
    if (this.fails.lockedUntil > this.now()) throw new RoomError(ERRORS.pinLocked);
    const login = sanitizeName(rawLogin);
    const okLogin = login.toLocaleLowerCase("fr") === this.account.login.toLocaleLowerCase("fr");
    const expected = Buffer.from(this.account.hash, "hex");
    const actual = scryptSync(typeof rawPassword === "string" ? rawPassword : "", this.account.salt, 32);
    const okPassword = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!okLogin || !okPassword) {
      this.fails.count++;
      if (this.fails.count >= MAX_FAILS) this.fails = { count: 0, lockedUntil: this.now() + LOCK_MS };
      throw new RoomError(ERRORS.adminWrong);
    }
    this.fails = { count: 0, lockedUntil: 0 };
    return this.openSession();
  }

  /** Vérifie une session de la page hôte ; lève une erreur si elle n'est plus valable. */
  check(token: unknown): void {
    const expires = typeof token === "string" ? this.sessions.get(token) : undefined;
    if (!expires || expires < this.now()) {
      if (typeof token === "string") this.sessions.delete(token);
      throw new RoomError(ERRORS.adminSession);
    }
  }

  logout(token: unknown): void {
    if (typeof token === "string") this.sessions.delete(token);
  }

  private openSession(): string {
    const token = randomBytes(24).toString("base64url");
    this.sessions.set(token, this.now() + SESSION_MS);
    return token;
  }
}
