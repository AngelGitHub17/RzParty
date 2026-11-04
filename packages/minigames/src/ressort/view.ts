import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { timingView } from "../timingView.ts";
import { elan, ressortScore, spring, type RessortParams } from "./logic.ts";

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** Le ressort vu de face : il se tend et se détend, le personnage s'envole quand on appuie. */
export function ressortView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const svg = el("svg", { viewBox: "0 0 640 300" }) as SVGSVGElement;
  svg.append(el("rect", { x: 0, y: 0, width: 640, height: 300, fill: "#cdebff" }), el("rect", { x: 0, y: 270, width: 640, height: 30, fill: "#7ed957" }));
  // Jauge à droite : la zone haute est la bonne.
  svg.append(el("rect", { x: 560, y: 40, width: 36, height: 220, rx: 18, fill: "#ffffff" }), el("rect", { x: 560, y: 40, width: 36, height: 40, rx: 18, fill: "#ffc83d" }));
  const needle = el("rect", { x: 552, y: 0, width: 52, height: 8, rx: 4, fill: "#1e2a4a" });
  const elanText = el("text", { x: 578, y: 30, "text-anchor": "middle", "font-size": 18, "font-weight": 800, fill: "#1e2a4a" });
  const coil = el("path", { fill: "none", stroke: "#56627f", "stroke-width": 8, "stroke-linecap": "round", "stroke-linejoin": "round" });
  const hero = el("g", {});
  hero.append(el("rect", { x: -26, y: -6, width: 52, height: 10, rx: 5, fill: "#f0483e" }), el("circle", { cx: 0, cy: -26, r: 20, fill: "#2db866" }), el("circle", { cx: -7, cy: -30, r: 3, fill: "#1e2a4a" }), el("circle", { cx: 7, cy: -30, r: 3, fill: "#1e2a4a" }));
  const heightText = el("text", { x: 300, y: 40, "text-anchor": "middle", "font-size": 26, "font-weight": 800, fill: "#1e2a4a" });
  svg.append(needle, elanText, coil, hero, heightText);

  /** Dessine le ressort comprimé selon `h` (0 = détendu, 1 = comprimé au maximum). */
  const drawCoil = (top: number) => {
    const bottom = 268;
    const turns = 8;
    let d = `M300 ${bottom}`;
    for (let i = 1; i <= turns * 2; i++) d += ` L${300 + (i % 2 ? -34 : 34)} ${bottom - ((bottom - top) * i) / (turns * 2)}`;
    d += ` L300 ${top}`;
    coil.setAttribute("d", d);
  };

  return timingView<RessortParams>(root, ctx, "ressort", {
    button: "SAUTER",
    instruction: () => "Saute quand la jauge est tout en haut !",
    stage: svg,
    draw(t, p, pressedAt, phase) {
      const live = t === null || phase === "ready" ? 0 : spring(pressedAt ?? t, p);
      needle.setAttribute("y", String(256 - live * 216));
      elanText.textContent = t === null || phase === "ready" ? "×1.00" : `×${elan(pressedAt ?? t, p).toFixed(2)}`;
      if (pressedAt === null || t === null) {
        const top = 260 - 120 * (1 - live) - 40;
        drawCoil(top);
        hero.setAttribute("transform", `translate(300 ${top})`);
        heightText.textContent = "";
        return;
      }
      // Envol : hauteur proportionnelle au score.
      const score = ressortScore(pressedAt, p);
      const flight = Math.min(1, (t - pressedAt) / 1200);
      const peak = Math.min(150, 10 + score * 0.9);
      drawCoil(100);
      hero.setAttribute("transform", `translate(300 ${100 - Math.sin(Math.PI * flight) * peak})`);
      heightText.textContent = score ? `${score} m` : "Raté !";
    },
    totalLabel: (n) => `${n} m`,
  });
}
