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
