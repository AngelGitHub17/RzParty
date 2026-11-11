import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChallengeRecord } from "@rzparty/shared";

/** Nombre de meilleurs scores gardés pour le mode « Défis ». */
export const CHALLENGE_TOP = 5;

/**
 * Tableau des meilleurs scores du mode « Défis » (score d'équipe), gardé dans `data/defis.json`.
 * Les scores sont rangés du meilleur au moins bon.
 */
export class ChallengeStore {
  private readonly file: string;
  private top: ChallengeRecord[] = [];

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "defis.json");
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
        if (Array.isArray(raw)) {
          this.top = raw
            .filter((r): r is ChallengeRecord => typeof r?.score === "number" && Array.isArray(r?.names) && typeof r?.at === "number")
            .slice(0, CHALLENGE_TOP);
        }
      }
    } catch {
      this.top = [];
    }
  }

  list(): ChallengeRecord[] {
    return this.top.map((r) => ({ ...r, names: [...r.names] }));
  }

  /** Ajoute un score ; renvoie sa place (0 = nouveau record) ou -1 s'il n'entre pas au tableau. */
  submit(score: number, names: string[], at: number): number {
    if (score <= 0) return -1;
    const entry: ChallengeRecord = { score: Math.round(score), names: names.slice(0, 8), at };
    const next = [...this.top, entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, CHALLENGE_TOP);
    const place = next.indexOf(entry);
    if (place < 0) return -1;
    this.top = next;
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.top, null, 2));
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      // Disque plein ou dossier en lecture seule : le tableau reste en mémoire.
    }
    return place;
  }
}
