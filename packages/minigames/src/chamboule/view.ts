import "./style.css";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { timingView } from "../timingView.ts";
import { CANS, aimAt, cansDown, type ChambouleParams } from "./logic.ts";

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** Le stand vu de face : la pyramide de boîtes, le viseur qui va et vient, la balle. */
export function chambouleView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const svg = el("svg", { viewBox: "0 0 400 260" }) as SVGSVGElement;
  svg.append(el("rect", { x: 0, y: 0, width: 400, height: 260, fill: "#ffe7c2" }), el("rect", { x: 0, y: 190, width: 400, height: 70, fill: "#c98a4a" }));
  const pyramid = el("g", {});
  const cans: SVGElement[] = [];
  const rows = [3, 2, 1];
  rows.forEach((n, r) => {
    for (let k = 0; k < n; k++) {
      const can = el("rect", { x: (k - (n - 1) / 2) * 26 - 11, y: 160 - r * 30, width: 22, height: 28, rx: 4, fill: ["#f0483e", "#3d8bff", "#ffc83d"][r]!, stroke: "#1e2a4a", "stroke-width": 2 });
      pyramid.append(can);
      cans.push(can);
    }
  });
  const sight = el("g", {});
  sight.append(el("circle", { cx: 0, cy: 0, r: 14, fill: "none", stroke: "#1e2a4a", "stroke-width": 3 }), el("line", { x1: -20, y1: 0, x2: 20, y2: 0, stroke: "#1e2a4a", "stroke-width": 2 }), el("line", { x1: 0, y1: -20, x2: 0, y2: 20, stroke: "#1e2a4a", "stroke-width": 2 }));
  const ball = el("circle", { r: 9, fill: "#ffffff", stroke: "#1e2a4a", "stroke-width": 2 });
  svg.append(pyramid, sight, ball);
  const X = (aim: number) => 200 + aim * 160;
  return timingView<ChambouleParams>(root, ctx, "chamboule", {
    button: "LANCER",
    instruction: () => "Lance quand le viseur est au milieu des boîtes !",
    stage: svg,
    draw(t, p, pressedAt, phase, spectator) {
      pyramid.setAttribute("transform", `translate(${X(p.center)} 0)`);
      const now = t ?? 0;
      const aimT = pressedAt ?? now;
      sight.setAttribute("transform", `translate(${X(aimAt(phase === "ready" ? 0 : aimT, p))} 130)`);
      const down = pressedAt === null || spectator ? 0 : cansDown(pressedAt, p);
      const fly = pressedAt === null ? -1 : Math.min(1, (now - pressedAt) / 350);
      ball.setAttribute("opacity", fly >= 0 && fly < 1 ? "1" : "0");
      if (fly >= 0) ball.setAttribute("transform", `translate(${X(aimAt(pressedAt!, p))} ${250 - fly * 120}) scale(${1 - fly * 0.5})`);
      cans.forEach((can, i) => {
        // Les boîtes tombent du haut vers le bas de la pyramide.
        const fallen = fly >= 1 && CANS - 1 - i < down;
        can.setAttribute("transform", fallen ? `translate(${(i % 2 ? 1 : -1) * 30} 40) rotate(${(i % 2 ? 1 : -1) * 80} ${0} ${0})` : "");
        can.setAttribute("opacity", fallen ? "0.5" : "1");
      });
    },
    totalLabel: (n) => `${n} pts`,
    scene3d: () => import("./scene3d.ts"),
  });
}
