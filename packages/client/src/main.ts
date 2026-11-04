import "@fontsource-variable/fredoka";
import "./styles.css";
import { socket } from "./net/connection.ts";
import "./game/clock.ts";
import { clear, h } from "./ui/dom.ts";
import { homeView } from "./views/home.ts";
import { screenView } from "./views/screen.ts";
import { playerView } from "./views/player.ts";
import { hostView } from "./views/host.ts";

export interface ViewContext {
  navigate(path: string): void;
}

/** Une vue monte son interface dans `root` et renvoie une fonction de nettoyage. */
export type View = (root: HTMLElement, ctx: ViewContext) => () => void;

const routes: Record<string, View> = {
  "/": homeView,
  "/accueil": homeView,
  "/ecran": screenView,
  "/manette": playerView("manette"),
  "/jouer": playerView("jouer"),
  "/hote": hostView,
};

const root = document.getElementById("app")!;
let cleanup: (() => void) | null = null;

function mount(): void {
  cleanup?.();
  clear(root);
  const view = routes[window.location.pathname] ?? homeView;
  document.body.dataset.route = window.location.pathname === "/" ? "accueil" : window.location.pathname.slice(1);
  cleanup = view(root, { navigate });
}

function navigate(path: string): void {
  history.pushState(null, "", path);
  mount();
}

window.addEventListener("popstate", mount);

// Bandeau de connexion perdue, commun à toutes les vues.
const banner = h("div", { class: "net-banner", attrs: { role: "status", hidden: true } }, "Connexion au serveur perdue. Reconnexion…");
document.body.append(banner);
let lostTimer: ReturnType<typeof setTimeout> | undefined;
socket.on("disconnect", () => {
  // Petit délai pour ne pas clignoter lors d'une micro-coupure.
  lostTimer = setTimeout(() => (banner.hidden = false), 800);
});
socket.on("connect", () => {
  clearTimeout(lostTimer);
  banner.hidden = true;
  banner.textContent = "Connexion au serveur perdue. Reconnexion…";
});
socket.on("server:stopping", () => {
  banner.textContent = "Le serveur RzParty s'est arrêté ou a changé de port. Rouvre le jeu avec la nouvelle adresse affichée sur le PC hôte.";
  banner.hidden = false;
});
socket.io.on("reconnect_failed", () => {
  banner.textContent = "Le serveur RzParty ne répond plus. Vérifie que le PC hôte est allumé, puis recharge la page.";
});

mount();
