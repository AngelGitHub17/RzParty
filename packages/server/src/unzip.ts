/**
 * Lecture d'une archive .zip (méthodes « stockée » et « deflate »), sans dépendance :
 * sert à installer une mise à jour téléchargée depuis le site.
 */
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
  /** Droits Unix enregistrés dans l'archive (0 si absents). */
  mode: number;
}

export function readZip(zip: Buffer): ZipEntry[] {
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Archive .zip illisible.");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Archive .zip abîmée.");
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const external = zip.readUInt32LE(p + 38);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error("Archive .zip abîmée.");
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compressed);
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`Méthode de compression non prise en charge (${method}).`);
    entries.push({ name, data, mode: (external >>> 16) & 0o777 });
  }
  return entries;
}
