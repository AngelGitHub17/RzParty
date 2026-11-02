import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { timingView } from "../timingView.ts";
import type { PasParams } from "./logic.ts";

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** Un marcheur sur un chemin ; après quelques pas, un brouillard cache tout. */
export function pasView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const svg = el("svg", { viewBox: "0 0 640 240" }) as SVGSVGElement;
  svg.append(el("rect", { x: 0, y: 0, width: 640, height: 240, fill: "#cdebff" }), el("rect", { x: 0, y: 170, width: 640, height: 70, fill: "#7ed957" }), el("rect", { x: 0, y: 178, width: 640, height: 18, fill: "#e9d3a5" }));
  const prints = el("g", {});
  const walker = el("g", {});
  walker.append(el("rect", { x: -12, y: -40, width: 24, height: 34, rx: 10, fill: "#9257e8" }), el("circle", { cx: 0, cy: -52, r: 11, fill: "#f7cba0" }));
  const legL = el("rect", { x: -9, y: -8, width: 7, height: 18, rx: 3, fill: "#1e2a4a" });
  const legR = el("rect", { x: 2, y: -8, width: 7, height: 18, rx: 3, fill: "#1e2a4a" });
  walker.append(legL, legR);
  const fog = el("rect", { x: 0, y: 0, width: 640, height: 240, fill: "#eef3f8", opacity: 0 });
  const counter = el("text", { x: 320, y: 60, "font-size": 44, "font-weight": 800, fill: "#1e2a4a", "text-anchor": "middle" });
  svg.append(prints, walker, fog, counter);
  let printed = -1;

  return timingView<PasParams>(root, ctx, "pas", {
    button: "STOP",
    instruction: (p) => `Arrête-toi au pas n°${p.target}`,
    stage: svg,
    draw(t, p, pressedAt, phase) {
      const steps = t === null || phase === "ready" ? 0 : (pressedAt ?? t) / p.pace;
      const whole = Math.floor(steps);
      // Le chemin défile : le marcheur reste au milieu, les traces de pas reculent.
      const spacing = 34;
      walker.setAttribute("transform", "translate(320 182)");
      const swingLeg = Math.sin(steps * Math.PI) * 6;
      legL.setAttribute("transform", `translate(${swingLeg} 0)`);
      legR.setAttribute("transform", `translate(${-swingLeg} 0)`);
      if (whole !== printed) {
        printed = whole;
        while (prints.firstChild) prints.removeChild(prints.firstChild);
        for (let i = 0; i < whole && i < 14; i++) prints.append(el("ellipse", { cx: 320 - (i + 1) * spacing, cy: i % 2 ? 182 : 192, rx: 7, ry: 4, fill: "#b38b57" }));
      }
      const hidden = phase === "run" && pressedAt === null && steps >= p.visible;
      fog.setAttribute("opacity", hidden ? "0.97" : "0");
      counter.textContent = phase === "ready" || t === null ? "" : hidden ? "?" : phase === "result" ? `${steps.toFixed(1).replace(".", ",")} pas` : `${whole} pas`;
    },
  });
}
