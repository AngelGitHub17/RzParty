/**
 * Page de présentation de RzParty (servie sur « / » par le serveur en ligne, RZ_SITE=1).
 * Les modes et les mini-jeux viennent des mêmes fiches que le jeu : la page reste à jour toute seule.
 */
import "@fontsource-variable/fredoka";
import "../styles.css";
import "./site.css";
import { DEFAULT_GITHUB_REPO, GAME_MODES, findInstallers, type ChangelogEntry, type GameModeId, type InstallerInfo, type InstallerList, type ReleaseInfo } from "@rzparty/shared";
import { MINI_GAME_DEFINITIONS } from "@rzparty/minigames/catalog";
import { h } from "../ui/dom.ts";
import { wordmark } from "../ui/brand.ts";
import { pawn } from "../ui/avatar.ts";

const root = document.getElementById("site")!;

/** Capture d'écran de chaque mode (dans public/site). */
const MODE_ART: Partial<Record<GameModeId, string>> = {
  plateau: "/site/plateau.webp",
  roue: "/site/roue.webp",
  quiz: "/site/quiz.webp",
  mots: "/site/mots.webp",
  survie: "/site/tremplin.webp",
  ile: "/site/ile.webp",
  voyage: "/site/voyage.webp",
  loto: "/site/loto.webp",
  trios: "/site/trios.webp",
  bateau: "/site/bateau.webp",
  paires: "/site/paires.webp",
  amitie: "/site/amitie.webp",
  tictac: "/site/tictac.webp",
  cris: "/site/cris.webp",
  cache: "/site/cache.webp",
  intrus: "/site/intrus.webp",
  libre: "/site/libre.webp",
  bataille: "/site/bataille.webp",
  solo: "/site/solo.webp",
  defis: "/site/defis.webp",
};
const MODE_ORDER: GameModeId[] = ["plateau", "ile", "voyage", "survie", "roue", "loto", "trios", "bateau", "paires", "amitie", "quiz", "mots", "tictac", "cris", "cache", "intrus", "libre", "bataille", "solo", "defis"];

const link = (href: string, text: string, cls = "") => h("a", { class: cls, attrs: { href }, text });

function shot(src: string, alt: string, cls = "shot"): HTMLElement {
  return h("img", { class: cls, attrs: { src, alt, loading: "lazy", decoding: "async" } });
}

function section(id: string, title: string, lead: string | null, ...body: Node[]): HTMLElement {
  return h(
    "section",
    { class: "site-section", attrs: { id, "aria-labelledby": `${id}-titre` } },
    h("h2", { class: "site-section__title", text: title, attrs: { id: `${id}-titre` } }),
    lead ? h("p", { class: "site-section__lead", text: lead }) : null,
    ...body,
  );
}

// ── En-tête ──
const header = h(
  "header",
  { class: "site-bar" },
  h("a", { class: "site-bar__brand", attrs: { href: "#haut", "aria-label": "RzParty, haut de page" } }, wordmark("small")),
  h(
    "nav",
    { class: "site-bar__nav", attrs: { "aria-label": "Sections" } },
    link("#modes", "Modes"),
    link("#mini-jeux", "Mini-jeux"),
    link("#chez-soi", "Jouer chez soi"),
    link("#mises-a-jour", "Mises à jour"),
  ),
  link("/accueil", "Jouer", "btn btn--go btn--small"),
);

// ── Accroche ──
const versionTag = h("span", { class: "site-hero__version" });
const hero = h(
  "section",
  { class: "site-hero", attrs: { id: "haut" } },
  h(
    "div",
    { class: "site-hero__text" },
    wordmark("big"),
    h("h1", { text: "Le jeu de société à plusieurs, directement dans le navigateur." }),
    h("p", {
      class: "site-hero__sub",
      text: "Un plateau plein de surprises, une île aux six défis, une trentaine de mini-jeux, un tour du monde, un bingo, un bateau à équilibrer, des paires à retrouver et un quiz entre amis. La télé affiche la partie, les téléphones servent de manettes. Rien à installer pour les joueurs.",
    }),
    h(
      "div",
      { class: "site-hero__cta" },
      link("/accueil", "Jouer en ligne", "btn btn--go site-btn-big"),
      link("#chez-soi", "Installer chez soi (Windows, Linux, Mac)", "btn btn--ghost site-btn-big"),
    ),
    versionTag,
  ),
  h(
    "div",
    { class: "site-hero__art", attrs: { "aria-hidden": "true" } },
    h("div", { class: "tv" }, shot("/site/plateau.webp", "", "tv__screen")),
    h("div", { class: "phone" }, shot("/site/manette.webp", "", "phone__screen")),
    h("div", { class: "site-hero__pawns" }, pawn(1, { size: 58 }), pawn(0, { size: 72 }), pawn(3, { size: 58 })),
  ),
);

// ── Deux façons de jouer ──
const ways = section(
  "comment",
  "Deux façons de jouer",
  null,
  h(
    "div",
    { class: "site-ways" },
    h(
      "article",
      { class: "site-card" },
      h("div", { class: "site-card__art" }, pawn(1, { size: 52 }), pawn(0, { size: 64 }), pawn(3, { size: 52 })),
      h("h3", { text: "Un écran pour tout le monde" }),
      h("p", { text: "La télé ou le PC du salon affiche le jeu. Chacun scanne le QR code et joue avec son téléphone." }),
    ),
    h(
      "article",
      { class: "site-card" },
      h("div", { class: "site-card__art" }, pawn(4, { size: 56 }), pawn(5, { size: 56 })),
      h("h3", { text: "Chacun son écran" }),
      h("p", { text: "Chaque joueur voit la partie sur son ordinateur, sa tablette ou son téléphone. Idéal à distance." }),
    ),
    h(
      "article",
      { class: "site-card" },
      h("div", { class: "site-card__art" }, pawn(2, { size: 56 }), pawn(6, { size: 56 })),
      h("h3", { text: "De 1 à 8 joueurs" }),
      h("p", { text: "Il manque du monde ? Des bots aux caractères différents complètent la partie. Équipes possibles." }),
    ),
  ),
);

// ── Modes ──
const modes = section(
  "modes",
  "Douze façons de faire la fête",
  "Le chef du salon choisit le mode et ses réglages : longueur du plateau, nombre de questions, de bombes, mini-jeux autorisés…",
  h(
    "div",
    { class: "site-modes" },
    ...MODE_ORDER.map((id, i) => {
      const art = MODE_ART[id];
      return h(
        "article",
        { class: "site-mode" },
        art
          ? shot(art, `Capture du mode ${GAME_MODES[id].label}`, "site-mode__shot")
          : h("div", { class: "site-mode__shot site-mode__shot--pawns" }, pawn(i, { size: 60 }), pawn(i + 2, { size: 74 }), pawn(i + 4, { size: 60 })),
        h("h3", { text: GAME_MODES[id].label }),
        h("p", { text: GAME_MODES[id].description }),
      );
    }),
  ),
);

// ── Mini-jeux ──
const games = section(
  "mini-jeux",
  `${MINI_GAME_DEFINITIONS.length} mini-jeux`,
  "Réflexes, mémoire, calcul, bluff ou sens du rythme : tous se jouent aussi bien au téléphone qu'au clavier.",
  h(
    "ul",
    { class: "site-games" },
    ...MINI_GAME_DEFINITIONS.map((g) =>
      h("li", { class: "site-game" }, shot(`/site/mg/${g.id}.webp`, `Capture du mini-jeu ${g.name}`, "site-game__shot"), h("strong", { text: g.name }), h("span", { text: g.rules })),
    ),
  ),
);

// ── Jouer chez soi ──
const downloadBtn = link("/telecharger", "Télécharger RzParty", "btn btn--go site-btn-big");
const downloadInfo = h("p", { class: "muted site-download__info" });
const olderList = h("ul", { class: "site-older__list" });
const older = h(
  "details",
  { class: "site-older", attrs: { hidden: true } },
  h("summary", { text: "Anciennes versions" }),
  h("p", { class: "muted", text: "Pour rejouer une version précise. Une version archivée reste telle quelle : elle ne se met jamais à jour toute seule." }),
  olderList,
);
const step = (n: number, title: string, ...body: (Node | string)[]) =>
  h("li", { class: "site-step" }, h("span", { class: "site-step__n", text: String(n), attrs: { "aria-hidden": "true" } }), h("div", {}, h("h3", { text: title }), ...body));
const OS_LABEL: Record<InstallerInfo["os"], { label: string; file: string; icon: string }> = {
  windows: { label: "Windows", file: ".msi", icon: "🪟" },
  linux: { label: "Linux", file: ".deb", icon: "🐧" },
  mac: { label: "Mac", file: ".pkg", icon: "🍎" },
};
const installers = h("div", { class: "site-installers" }, h("p", { class: "muted", text: "Recherche des installeurs…" }));
const installerNote = h("p", { class: "muted site-download__info" });

function myOs(): InstallerInfo["os"] {
  const ua = navigator.userAgent;
  return /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "mac" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : "windows";
}

function renderInstallers(files: InstallerInfo[], release: string | null = null, current = ""): void {
  if (!files.length) {
    installers.replaceChildren(
      h("p", { class: "muted", text: "Les installeurs de cette version sont en cours de fabrication : reviens dans quelques minutes, ou prends le .zip ci-dessous." }),
      h("p", {}, h("a", { attrs: { href: `https://github.com/${DEFAULT_GITHUB_REPO}/releases`, target: "_blank", rel: "noopener" }, text: "Voir toutes les versions publiées sur GitHub" })),
    );
    return;
  }
  const mine = myOs();
  const sorted = [...files].sort((a, b) => Number(b.os === mine) - Number(a.os === mine));
  installers.replaceChildren(
    ...sorted.map((f) =>
      h(
        "a",
        { class: `btn ${f.os === mine ? "btn--go" : "btn--ghost"} site-installer`, attrs: { href: f.url, download: "" } },
        h("span", { class: "site-installer__icon", text: OS_LABEL[f.os].icon, attrs: { "aria-hidden": "true" } }),
        h("span", {}, h("strong", { text: `${OS_LABEL[f.os].label} (${OS_LABEL[f.os].file})` }), h("small", { text: `${Math.round(f.size / 1e6)} Mo` })),
      ),
    ),
  );
  installerNote.textContent = (release && current && release !== current ? `Installeurs de la version ${release}. ` : "") + "Node.js est inclus : rien d'autre à installer. Le jeu se met ensuite à jour tout seul, entre deux parties. Windows ou Mac peuvent avertir que l'éditeur est inconnu : choisis « Exécuter quand même » (Windows) ou clic droit puis « Ouvrir » (Mac).";
}

const home = section(
  "chez-soi",
  "Jouer chez soi, sans Internet",
  "Le serveur tourne sur un PC de la maison : les joueurs se connectent par le wifi, sans compte et sans rien installer.",
  h(
    "div",
    { class: "site-install-ways" },
    h(
      "article",
      { class: "site-card site-install" },
      h("h3", { text: "Le plus simple : l'installeur" }),
      h("p", { text: "Télécharge, double-clique, c'est installé. RzParty apparaît dans le menu Démarrer, le Bureau ou les Applications." }),
      installers,
      installerNote,
    ),
  ),
  h(
    "ol",
    { class: "site-steps" },
    h("li", { class: "site-steps__title" }, h("h3", { text: "Ou bien : le dossier .zip" })),
    step(1, "Installe Node.js", h("p", {}, "Prends la version LTS sur ", h("a", { attrs: { href: "https://nodejs.org/fr", target: "_blank", rel: "noopener" }, text: "nodejs.org" }), ". Une seule fois suffit.")),
    step(2, "Télécharge RzParty", h("p", { text: "Décompresse le fichier .zip où tu veux, par exemple dans Documents." }), h("div", { class: "site-download" }, downloadBtn, downloadInfo), older),
    step(
      3,
      "Lance le jeu",
      h("p", {}, "Double-clique sur ", h("code", { text: "start.bat" }), " (Windows) ou lance ", h("code", { text: "start.sh" }), " (Linux, Mac). Le jeu s'ouvre et affiche l'adresse à donner aux joueurs."),
    ),
    step(
      4,
      "Reste à jour",
      h("p", {}, "Quand une nouvelle version sort, ton RzParty te prévient : installe-la depuis la page ", h("code", { text: "/hote" }), " ou double-clique sur ", h("code", { text: "mettre-a-jour.bat" }), ". Tes profils et réglages sont conservés."),
    ),
  ),
);

// ── Mises à jour ──
const changelog = h("div", { class: "site-changelog" }, h("p", { class: "muted", text: "Chargement du journal…" }));
const updates = section("mises-a-jour", "Mises à jour", "Ce qui a changé dans chaque version de RzParty.", changelog);

let releases: ReleaseInfo[] = [];
const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function renderReleases(list: ReleaseInfo[]): void {
  releases = list;
  const old = list.filter((r) => !r.latest);
  older.hidden = !old.length;
  olderList.replaceChildren(
    ...old.map((r) =>
      h(
        "li",
        { class: "site-older__item" },
        h("strong", { text: `Version ${r.version}` }),
        h("span", { class: "muted", text: formatDate(r.date) }),
        h("a", { class: "btn btn--ghost btn--small", attrs: { href: `/telecharger/${r.version}`, download: "" }, text: "Télécharger (archivée)" }),
      ),
    ),
  );
}

function renderChangelog(entries: ChangelogEntry[], current: string): void {
  if (!entries.length) {
    changelog.replaceChildren(h("p", { class: "muted", text: "Le journal des versions n'est pas disponible pour le moment." }));
    return;
  }
  changelog.replaceChildren(
    ...entries.map((e, i) => {
      const summary = h(
        "summary",
        {},
        h("strong", { text: `Version ${e.version}` }),
        e.date ? h("span", { class: "muted", text: e.date }) : null,
        e.version === current ? h("span", { class: "site-badge", text: "en ligne" }) : null,
      );
      const archived = e.version !== current && releases.some((r) => r.version === e.version);
      const box = h(
        "details",
        { class: "site-release" },
        summary,
        h("ul", {}, ...e.items.map((it) => h("li", { text: it }))),
        archived ? h("a", { class: "site-release__dl", attrs: { href: `/telecharger/${e.version}`, download: "" }, text: `Télécharger la version ${e.version} (archivée, sans mise à jour automatique)` }) : null,
      );
      if (i < 2) box.setAttribute("open", "");
      return box;
    }),
  );
}

// ── Pied de page ──
const footer = h(
  "footer",
  { class: "site-foot" },
  wordmark("small"),
  h("p", { class: "muted", text: "Un jeu de société libre de toute publicité, fait maison par DidiKaria." }),
  h("p", {}, link("/accueil", "Jouer en ligne"), " · ", link("#chez-soi", "Télécharger"), " · ", link("#mises-a-jour", "Mises à jour")),
);

root.append(header, h("main", { class: "site-main" }, hero, ways, modes, games, home, updates), footer);

// Installeurs, version en ligne, anciennes versions et journal, servis par le serveur.
// Les installeurs : demandés au serveur ; s'il n'arrive pas à joindre GitHub, la page les cherche elle-même.
void (async () => {
  let version = "";
  let repo = DEFAULT_GITHUB_REPO;
  try {
    const r = await fetch("/api/installeurs");
    if (r.ok) {
      const data = (await r.json()) as Partial<InstallerList> & { version?: string; repo?: string };
      version = data.version ?? "";
      repo = data.repo ?? repo;
      if (data.files?.length) return renderInstallers(data.files, data.release ?? null, version);
    }
  } catch {
    // On essaie GitHub directement.
  }
  try {
    const list = await findInstallers((url) => fetch(url, { headers: { accept: "application/vnd.github+json" } }), version || "0", repo);
    renderInstallers(list.files, list.release, version);
  } catch {
    renderInstallers([], null, version);
  }
})();
const releasesReady = fetch("/api/versions")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((data: { releases: ReleaseInfo[] }) => renderReleases(data.releases))
  .catch(() => renderReleases([]));
void fetch("/api/mises-a-jour")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((data: { version: string; entries: ChangelogEntry[] }) => {
    versionTag.textContent = `Version ${data.version}`;
    downloadInfo.textContent = `Version ${data.version} · se met à jour toute seule · fichier .zip · Windows, Linux et Mac`;
    downloadBtn.setAttribute("download", "");
    void releasesReady.then(() => renderChangelog(data.entries, data.version));
  })
  .catch(() => renderChangelog([], ""));

// Arrivée directe sur #mises-a-jour : le contenu se charge après, on y retourne.
if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 300);
