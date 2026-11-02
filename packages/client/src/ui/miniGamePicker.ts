import { MINI_GAME_DEFINITIONS } from "@rzparty/minigames/catalog";
import { h } from "./dom.ts";

const CATEGORY_LABELS: Record<string, string> = {
  reflexes: "Réflexes",
  memoire: "Mémoire et observation",
  calcul: "Calcul",
  logique: "Logique et stratégie",
  labyrinthe: "Orientation",
  bombe: "Tous ensemble",
  frappe: "Frappe",
  chaines: "Lettres",
};

let open = false;

/** Ids réellement joués : liste vide = tous. */
export function activeMiniGames(chosen: string[]): string[] {
  const known = MINI_GAME_DEFINITIONS.map((d) => d.id);
  const kept = chosen.filter((id) => known.includes(id));
  return kept.length ? kept : known;
}

/**
 * Choix des mini-jeux (chef) : tout, une sélection, ou un seul pour enchaîner le même jeu.
 * La liste vide signifie « tous ».
 */
export function miniGamePicker(chosen: string[], update: (miniGames: string[]) => void): HTMLElement {
  const all = MINI_GAME_DEFINITIONS.map((d) => d.id);
  const active = new Set(activeMiniGames(chosen));
  const set = (ids: string[]) => update(ids.length === all.length ? [] : ids);
  const groups = new Map<string, typeof MINI_GAME_DEFINITIONS>();
  for (const d of MINI_GAME_DEFINITIONS) groups.set(d.category, [...(groups.get(d.category) ?? []), d]);
  return h(
    "details",
    { class: "cfg mgpick", attrs: { open }, on: { toggle: (e) => (open = (e.target as HTMLDetailsElement).open) } },
    h("summary", { text: `Mini-jeux · ${active.size === all.length ? `tous (${all.length})` : `${active.size} sur ${all.length}`}` }),
    h(
      "div",
      { class: "cfg__presets" },
      h("button", { class: "chip-btn", attrs: { type: "button" }, text: "Tous", on: { click: () => update([]) } }),
      h("p", { class: "muted field-help", text: "Décoche ceux que tu ne veux pas, ou touche « seul » pour ne jouer qu'à un mini-jeu." }),
    ),
    ...[...groups].map(([cat, defs]) =>
      h(
        "div",
        { class: "cfg__group" },
        h("h3", { text: CATEGORY_LABELS[cat] ?? cat }),
        ...defs.map((d) =>
          h(
            "div",
            { class: "mgpick__row" },
            h(
              "label",
              { class: "mgpick__label", attrs: { title: d.rules } },
              h("input", {
                attrs: { type: "checkbox", checked: active.has(d.id) },
                on: {
                  change: (e) => {
                    const on = (e.target as HTMLInputElement).checked;
                    const next = on ? [...active, d.id] : [...active].filter((id) => id !== d.id);
                    if (next.length) set(next);
                    else (e.target as HTMLInputElement).checked = true;
                  },
                },
              }),
              h("span", { text: d.name }),
            ),
            h("button", { class: "chip-btn mgpick__solo", attrs: { type: "button" }, text: "seul", on: { click: () => update([d.id]) } }),
          ),
        ),
      ),
    ),
  );
}
