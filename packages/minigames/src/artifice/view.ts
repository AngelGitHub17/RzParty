import "./style.css";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { timingView } from "../timingView.ts";
import { ARTIFICE_COLORS, artificeScore, landingAt, rocketHeight, type ArtificeParams } from "./logic.ts";

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Ciel de nuit vu de face : la fusée monte, ralentit, redescend ; l'éclat à l'appui. */
export function artificeView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const svg = el("svg", { viewBox: "0 0 400 300" }) as SVGSVGElement;
  svg.append(el("rect", { x: 0, y: 0, width: 400, height: 300, fill: "#141b3d" }), el("rect", { x: 0, y: 270, width: 400, height: 30, fill: "#23305e" }));
  for (let k = 0; k < 30; k++) svg.append(el("circle", { cx: (k * 137) % 400, cy: (k * 53) % 240, r: k % 3 ? 1 : 1.6, fill: "#ffffff", opacity: 0.6 }));
  const rocket = el("g", {});
  rocket.append(el("rect", { x: -4, y: -14, width: 8, height: 18, rx: 3, fill: "#f0483e" }), el("path", { d: "M-4 -14 L0 -22 L4 -14 Z", fill: "#ffc83d" }));
  const burst = el("g", { opacity: 0 });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    burst.append(el("line", { x1: 0, y1: 0, x2: Math.cos(a) * 40, y2: Math.sin(a) * 40, "stroke-width": 4, "stroke-linecap": "round", stroke: "#ffffff" }));
  }
  svg.append(rocket, burst);
  const Y = (h: number) => 270 - h * 240;
  return timingView<ArtificeParams>(root, ctx, "artifice", {
    button: "BOUM !",
    instruction: () => "Fais éclater la fusée tout en haut !",
    stage: svg,
    draw(t, p, pressedAt, phase, spectator) {
      if (t === null || phase === "ready") {
        rocket.setAttribute("transform", `translate(200 ${Y(0)})`);
        burst.setAttribute("opacity", "0");
        return;
      }
      const at = spectator || pressedAt === null ? Math.min(t, landingAt(p)) : pressedAt;
      const h = rocketHeight(at, p);
      rocket.setAttribute("transform", `translate(200 ${Y(h)})`);
      const score = pressedAt === null ? 0 : artificeScore(pressedAt, p);
      const since = pressedAt === null ? -1 : t - pressedAt;
      if (since >= 0 && score > 0) {
        rocket.setAttribute("opacity", "0");
        const grow = Math.min(1, since / 400) * (0.4 + score / 100);
        burst.setAttribute("transform", `translate(200 ${Y(h)}) scale(${grow})`);
        burst.setAttribute("opacity", String(Math.max(0, 1 - since / 1600)));
        for (const line of Array.from(burst.children)) line.setAttribute("stroke", hex(ARTIFICE_COLORS[p.color] ?? 0xffffff));
      } else {
        rocket.setAttribute("opacity", "1");
        burst.setAttribute("opacity", "0");
      }
    },
    totalLabel: (n) => `${n} pts`,
    scene3d: () => import("./scene3d.ts"),
  });
}
