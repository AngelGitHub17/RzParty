import {
  CELL_INFO,
  CONFIGURABLE_CELLS,
  CONFIG_LIMITS,
  WEIGHT_MAX,
  type BoardConfig,
} from "@rzparty/shared";
import { h } from "./dom.ts";

type NumericKey = keyof typeof CONFIG_LIMITS;

/** Le panneau est reconstruit à chaque mise à jour du salon : on retient s'il est replié. */
let open = true;

/** Champ numérique avec boutons − / + (pratique au doigt) et saisie directe. */
function stepper(key: NumericKey, value: number, step: number, onChange: (v: number) => void): HTMLElement {
  const { min, max, label, help } = CONFIG_LIMITS[key];
  const input = h("input", {
    class: "stepper__input",
    attrs: { type: "number", min, max, step, value, inputmode: "numeric", "aria-label": label },
    on: {
      change: () => {
        const v = Math.min(max, Math.max(min, Math.round(Number(input.value) || 0)));
        input.value = String(v);
        onChange(v);
      },
    },
  });
  const bump = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return h(
    "div",
    { class: "cfg-field" },
    h("span", { class: "cfg-field__label", text: label }),
    h(
      "div",
      { class: "stepper" },
      h("button", { class: "stepper__btn", attrs: { type: "button", "aria-label": `${label} : moins`, disabled: value <= min }, text: "−", on: { click: () => bump(-step) } }),
      input,
      h("button", { class: "stepper__btn", attrs: { type: "button", "aria-label": `${label} : plus`, disabled: value >= max }, text: "+", on: { click: () => bump(step) } }),
    ),
    help ? h("small", { class: "muted", text: help }) : null,
  );
}

function toggle(label: string, help: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  return h(
    "label",
    { class: "cfg-toggle" },
    h("input", { attrs: { type: "checkbox", checked: value }, on: { change: (e) => onChange((e.target as HTMLInputElement).checked) } }),
    h("span", { class: "cfg-toggle__switch", attrs: { "aria-hidden": "true" } }),
    h("span", {}, h("strong", { text: label }), h("small", { class: "muted", text: help })),
  );
}

/**
 * Configuration complète d'un plateau personnalisé (chef uniquement).
 * Chaque modification part au serveur, qui borne toutes les valeurs.
 */
export function boardConfigPanel(config: BoardConfig, update: (patch: Partial<BoardConfig> | { weights: Partial<BoardConfig["weights"]> }) => void): HTMLElement {
  const totalWeight = CONFIGURABLE_CELLS.reduce((s, c) => s + config.weights[c], 0) || 1;
  const big = config.length >= 100 ? 10 : 5;
  return h(
    "details",
    { class: "cfg", attrs: { open }, on: { toggle: (e) => (open = (e.target as HTMLDetailsElement).open) } },
    h("summary", { text: `Plateau personnalisé · ${config.length} cases` }),
    h(
      "div",
      { class: "cfg__group" },
      h("h3", { text: "Parcours" }),
      stepper("length", config.length, big, (length) => update({ length })),
      h(
        "div",
        { class: "cfg__presets" },
        ...[50, 100, 250, 500, 1000, 2000].map((n) =>
          h("button", { class: `chip-btn${config.length === n ? " is-on" : ""}`, attrs: { type: "button" }, text: String(n), on: { click: () => update({ length: n }) } }),
        ),
      ),
      stepper("forks", config.forks, 1, (forks) => update({ forks })),
      toggle("Variété", "Pas deux cases spéciales identiques à la suite, ni plus de 2 cases calmes d'affilée.", config.variety, (variety) => update({ variety })),
    ),
    h(
      "div",
      { class: "cfg__group" },
      h("h3", { text: "Proportions des cases" }),
      h("p", { class: "muted field-help", text: "Mets 0 pour qu'un type n'apparaisse jamais. Exemple : tout à 0 sauf les rouges = que des cases malus." }),
      ...CONFIGURABLE_CELLS.map((cell) => {
        const info = CELL_INFO[cell];
        const slider = h("input", {
          class: "cfg-weight__range",
          attrs: { type: "range", min: 0, max: WEIGHT_MAX, step: 1, value: config.weights[cell], "aria-label": `Proportion : ${info.label}` },
          style: { "--cell": info.color },
          on: { change: () => update({ weights: { [cell]: Number(slider.value) } }) },
        });
        return h(
          "div",
          { class: "cfg-weight" },
          h("span", { class: "cfg-weight__dot", style: { background: info.color }, text: info.symbol }),
          h("span", { class: "cfg-weight__name", text: info.label }),
          slider,
          h("strong", { class: "cfg-weight__pct", text: `${Math.round((config.weights[cell] / totalWeight) * 100)} %` }),
        );
      }),
    ),
    h(
      "div",
      { class: "cfg__group" },
      h("h3", { text: "Règles" }),
      stepper("bonusSteps", config.bonusSteps, 1, (bonusSteps) => update({ bonusSteps })),
      stepper("malusSteps", config.malusSteps, 1, (malusSteps) => update({ malusSteps })),
      stepper("miniGameEvery", config.miniGameEvery, 1, (miniGameEvery) => update({ miniGameEvery })),
      stepper("maxRounds", config.maxRounds, 5, (maxRounds) => update({ maxRounds })),
      toggle("Dés bonus", "Après chaque mini-jeu : dé d'or (1 à 6) au 1er, d'argent (1 à 3) au 2e, de bronze (1 ou 2) au 3e.", config.bonusDice, (bonusDice) => update({ bonusDice })),
      toggle("Défi final", "Arrivé au sommet, il faut encore gagner un mini-jeu seul contre tous ; sinon on redescend de 6 cases.", config.finalChallenge, (finalChallenge) => update({ finalChallenge })),
      toggle("Doubles", "Si deux dés font le même chiffre, un 3e dé est lancé.", config.doubles, (doubles) => update({ doubles })),
    ),
    h(
      "div",
      { class: "cfg__group" },
      h("h3", { text: "Pièces et objets" }),
      stepper("startCoins", config.startCoins, 10, (startCoins) => update({ startCoins })),
      stepper("coinMultiplier", config.coinMultiplier, 1, (coinMultiplier) => update({ coinMultiplier })),
      stepper("maxItems", config.maxItems, 1, (maxItems) => update({ maxItems })),
      stepper("duelStake", config.duelStake, 5, (duelStake) => update({ duelStake })),
    ),
  );
}
