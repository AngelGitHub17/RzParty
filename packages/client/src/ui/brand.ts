import { GAME_NAME, PLAYER_COLORS } from "@rzparty/shared";
import { h } from "./dom.ts";

/** Logo typographique : chaque lettre prend la couleur d'un joueur. */
export function wordmark(size: "big" | "small" = "big"): HTMLElement {
  return h(
    "span",
    { class: `wordmark wordmark--${size}`, attrs: { role: "img", "aria-label": GAME_NAME } },
    ...[...GAME_NAME].map((ch, i) =>
      h("span", { class: "wordmark__l", text: ch, style: { "--c": PLAYER_COLORS[i % PLAYER_COLORS.length]!.hex, "--i": String(i) }, attrs: { "aria-hidden": "true" } }),
    ),
  );
}
