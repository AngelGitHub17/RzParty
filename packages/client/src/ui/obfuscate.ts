import { h } from "./dom.ts";

/**
 * Texte brouillé façon « texte enchanté » : des symboles sans aucun sens qui changent sans arrêt.
 * Tous les éléments `.obf` de la page sont animés par un seul minuteur.
 */
const GLYPHS = "§¤#@%&?!¿¥ØÞßÆŒ∆≈ΩЖЯΣΨ¶※∑∂ƒ≠ʬʘ";
let timer: number | null = null;

function tick(): void {
  const nodes = document.querySelectorAll<HTMLElement>(".obf");
  if (!nodes.length) {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    return;
  }
  for (const node of nodes) {
    const len = Number(node.dataset.len) || 2;
    let text = "";
    for (let i = 0; i < len; i++) text += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    node.textContent = text;
  }
}

export function obfuscated(len: number, className = ""): HTMLElement {
  const el = h("span", { class: `obf ${className}`.trim(), attrs: { "data-len": len, "aria-label": "information brouillée" } });
  if (timer === null) timer = window.setInterval(tick, 55);
  queueMicrotask(tick);
  return el;
}
