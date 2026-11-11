/** Outils communs aux jeux de salon (Cris en folie, Cache-cache, Tic-tac-boum). */
import { PLAYER_COLORS, type PublicPlayer } from "@rzparty/shared";
import { clear, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { audioReady, unlockAudio } from "./sfx.ts";
import { serverNow } from "./clock.ts";

/** Secondes restantes avant `endsAt` (temps serveur). */
export function secondsLeft(endsAt: number | null): number | null {
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
}

/**
 * Bandeau « Touche pour activer le son » : les navigateurs coupent le son tant qu'on n'a pas touché la page.
 * Le bandeau disparaît dès que le son marche.
 */
export function soundGate(root: HTMLElement): { refresh(): void } {
  const banner = h("button", { class: "salon__sound", attrs: { type: "button" }, text: "🔊 Touche ici pour activer le son de ce téléphone" });
  banner.addEventListener("click", () => {
    unlockAudio();
    setTimeout(refresh, 150);
  });
  root.addEventListener("pointerdown", () => unlockAudio(), { capture: true });
  const refresh = () => {
    banner.hidden = audioReady();
  };
  root.prepend(banner);
  refresh();
  return { refresh };
}

/**
 * Fenêtre « Qui es-tu ? » : on touche son propre visage sur le téléphone de quelqu'un d'autre.
 * Renvoie la fenêtre (à placer dans la page) ; `pick` reçoit l'identifiant choisi.
 */
export function whoAmI(title: string, players: PublicPlayer[], pick: (id: string) => void, cancel: () => void): HTMLElement {
  const box = h(
    "div",
    { class: "salon__who", attrs: { role: "dialog", "aria-label": title } },
    h("p", { class: "salon__who-title", text: title }),
    h(
      "div",
      { class: "salon__who-grid" },
      ...players.map((p) =>
        h(
          "button",
          { class: "salon__who-btn", attrs: { type: "button" }, style: { "--player": PLAYER_COLORS[p.color]?.hex }, on: { click: () => pick(p.id) } },
          playerAvatar(p, { size: 64 }),
          h("span", { text: p.name }),
        ),
      ),
    ),
    h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Annuler", on: { click: cancel } }),
  );
  return box;
}

/** Ligne de joueurs (avatar + nom + valeur) pour l'écran commun. */
export function playerStrip(players: PublicPlayer[], ids: string[], label: (id: string) => string, mark?: (id: string) => string | null): HTMLElement {
  const strip = h("div", { class: "salon__strip" });
  clear(strip);
  for (const id of ids) {
    const p = players.find((x) => x.id === id);
    if (!p) continue;
    const extra = mark?.(id) ?? "";
    strip.append(
      h(
        "div",
        { class: `salon__seat ${extra}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
        playerAvatar(p, { size: 52 }),
        h("span", { class: "salon__seat-name", text: p.name }),
        h("strong", { text: label(id) }),
      ),
    );
  }
  return strip;
}

/** Petit nombre stable tiré d'un identifiant (pour décaler les sons de chaque téléphone). */
export function hashId(id: string): number {
  let x = 0;
  for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0;
  return x;
}
