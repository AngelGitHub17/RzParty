/**
 * Installeurs (.msi, .deb, .pkg) publiés par GitHub Actions sur les « releases » du dépôt.
 * Partagé entre le serveur (qui les liste pour la page de présentation) et la page elle-même
 * (qui interroge GitHub directement si le serveur n'y arrive pas).
 */
import type { InstallerInfo } from "./types.ts";

export const DEFAULT_GITHUB_REPO = "AngelGitHub17/RzParty";

/** Reconnaît un installeur à son extension. */
export function installerOf(name: string, url: string, size: number): InstallerInfo | null {
  const os = name.endsWith(".msi") ? "windows" : name.endsWith(".deb") ? "linux" : name.endsWith(".pkg") ? "mac" : null;
  return os ? { os, name, url, size } : null;
}

export interface InstallerList {
  /** Version des installeurs trouvés (peut différer de la version du serveur). */
  release: string | null;
  files: InstallerInfo[];
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Cherche les installeurs de la version demandée, sinon ceux de la dernière version publiée
 * (le serveur peut avoir un peu d'avance ou de retard sur les releases).
 */
export async function findInstallers(fetcher: Fetcher, version: string, repo = DEFAULT_GITHUB_REPO): Promise<InstallerList> {
  const base = `https://api.github.com/repos/${repo}/releases`;
  let lastError = "";
  for (const url of [`${base}/tags/v${version}`, `${base}/latest`]) {
    try {
      const res = await fetcher(url);
      if (!res.ok) {
        lastError = `GitHub a répondu ${res.status}`;
        continue;
      }
      const body = (await res.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string; size: number }[] };
      const files = (body.assets ?? []).map((a) => installerOf(a.name, a.browser_download_url, a.size)).filter((f): f is InstallerInfo => f !== null);
      if (files.length) return { release: body.tag_name?.replace(/^v/, "") ?? null, files };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (lastError) throw new Error(lastError);
  return { release: null, files: [] };
}
