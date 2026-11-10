import { PLAYER_COLORS, type BoardAction, type PublicPlayer } from "@rzparty/shared";
import { request, ServerError } from "../net/connection.ts";
import { h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { toast } from "../ui/toast.ts";

/** Envoie une action de mode de jeu et affiche l'erreur éventuelle. */
export async function sendAction(action: BoardAction): Promise<boolean> {
  try {
    await request("game:action", action);
    return true;
  } catch (err) {
    toast(err instanceof ServerError ? err.message : "Action impossible.", "error");
    return false;
  }
}

/** Tableau des scores d'un mode (classement, avatar, nom, valeur). */
export function scoreTable(players: PublicPlayer[], ids: string[], value: (id: string) => number, label: (id: string) => string, opts: { meId: string | null; highlight?: string | null; ascending?: boolean }): HTMLElement {
  const sorted = [...ids].sort((a, b) => (opts.ascending ? value(a) - value(b) : value(b) - value(a)));
  return h(
    "ol",
    { class: "bv-order" },
    ...sorted.flatMap((id) => {
      const p = players.find((x) => x.id === id);
      if (!p) return [];
      const rank = sorted.findIndex((x) => value(x) === value(id)) + 1;
      return h(
        "li",
        { class: `bv-row${opts.highlight === id ? " is-turn" : ""}${id === opts.meId ? " is-me" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
        h("span", { class: "bv-row__rank", text: rank === 1 ? "1er" : `${rank}e` }),
        playerAvatar(p, { size: 36 }),
        h("span", { class: "bv-row__name", text: p.name }),
        h("span", { class: "bv-row__coins" }, h("strong", { text: label(id) })),
      );
    }),
  );
}

/**
 * Passe un écran de mode en 3D : charge la scène à la demande, la pose dans `board` (à la place du dessin 2D,
 * qui reste affiché si WebGL manque ou si la scène échoue). `create` renvoie false pour abandonner.
 */
export function with3D<M>(board: HTMLElement, load: () => Promise<M>, create: (mod: M, host: HTMLElement) => boolean): void {
  void (async () => {
    const { webglAvailable } = await import("../three/kit3d.ts");
    if (!webglAvailable()) return;
    const mod = await load();
    const host = h("div", { class: "mode3d" });
    board.classList.add("has-3d");
    board.prepend(host);
    try {
      if (!create(mod, host)) {
        host.remove();
        board.classList.remove("has-3d");
      }
    } catch (err) {
      console.warn("3D indisponible", err);
      host.remove();
      board.classList.remove("has-3d");
    }
  })();
}
